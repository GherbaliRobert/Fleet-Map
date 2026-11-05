import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation, useRoute } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon, type IconName } from '../components/Icon';
import { Confirma } from '../components/FlotaUi';
import { BulaAi, BulaOm, Urmari, type Laturi } from '../components/InsightBula';
import { PaginaPachetConturi, PaginaPachete } from '../components/InsightPachet';
import { ButonProp } from '../components/InsightPropunere';
import { TEXT_ADMIN_FARA_LOC, TITLU_CONTURI, TITLU_PACHETE, arataPachetConturi, esteAdminFirma } from '../lib/insightPachet';
import { PaginaIncuiata, PaginaRamura, type LaPagina } from '../components/InsightPagini';
import { Gros } from '../components/InsightText';
import { dupaInapoi, useInapoiInchide } from '../lib/inapoiFoaie';
import {
  CARDURI, CARDURI_REGULI, NOTA_MENIU, PERIOADE, RAMURI_PE_TELEFON,
  areAi, aziActiune, aziPrimul, butonSursa, cand, corpIntrebare, faraDiacritice, grup, listaMeniu, listaPlus, masiniAlegere, mesajDinRaspuns, mesajUrmator,
  nivelAzi, placeholderCaseta, punInText, rutaButon, rutaRamura, stareDinQuota, textFaraLoc, textSalut,
} from '../lib/insight';
import { pagini, paginiDeschise, ramuraDupa, ramuraIncuiata, sumaNumere } from '../lib/insightPagini';
import './admin.css';    // .fld, .frm-actions (foile)
import './detail.css';   // .sheet*
import './flota.css';    // Confirma
import './insight.css';

// RA Insight pe telefon (02.11): discuția, ca secțiunea de pe web (public/index.html, blocul „secțiunea RA Insight"). Serverul
// face tot — recunoaște mașina, ține minte, socotește, scrie textele; ecranul doar arată. Regulile de ecran stau în lib/insight.ts,
// legate de pagină prin verify_telefon_insight.js. O pagină din „Domenii" are adresa ei (/insight/combustibil): „Înapoi" duce la discuție.
// „Vezi pachetele" și „Pachet și conturi" intră în loturile următoare.

// Conversația deschisă rămâne ținută minte cât trăiește aplicația (web: window._raxConvId): ecranul se reface când te întorci
// dintr-un raport, din Traseu sau din fișa mașinii. A altui om = 404, deci se pornește una nouă.
let convCurenta: any = null;
// Mașinile din „+", ținute minte 2 minute (web: _chatMasini).
let masiniMem: { t: number; l: any[] } | null = null;
// Ce e scris în casetă rămâne cât trăiește aplicația: te duci într-o pagină sau într-un raport și te întorci la întrebarea ta.
let ciornaMem = '';
let focusCiorna = false;   // „Întreabă RA Insight" dintr-o pagină: caseta ia cursorul când ajunge pe ecran

type Rand = { text: string; sub?: string; ic?: string; pune?: string; k?: string; sep?: boolean; rosu?: boolean };
type Foaie =
  | { fel: 'alege'; titlu: string; items: Rand[]; nota?: string; la: (x: Rand) => void }
  | { fel: 'redenumeste'; id: any; titlu: string }
  | { fel: 'sterge'; id: any }
  | { fel: 'notite'; text: string; max: number; poateScrie: boolean };

// O listă care se ridică de jos („+", Mașina, Perioada, Raport, „⋯"), cu căutare de la 8 rânduri (web: _chatAlege).
function Alege({ titlu, items, nota, onAles, onInchide }: { titlu: string; items: Rand[]; nota?: string; onAles: (x: Rand) => void; onInchide: () => void }) {
  const [q, setQ] = useState('');
  const n = faraDiacritice(q);
  const arata = items.filter((x) => !n || faraDiacritice((x.text || '') + ' ' + (x.sub || '')).indexOf(n) >= 0);
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) onInchide(); }}>
      <div class="sheet insp-al">
        <div class="sheet-h"><b>{titlu}</b><button class="h-btn" onClick={onInchide} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body">
          {items.length > 8 ? <input type="search" class="insp-al-cauta" placeholder="Caută…" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} /> : null}
          {arata.slice(0, 200).map((x) => (
            <button type="button" class={'insp-al-i' + (x.rosu ? ' rosu' : '') + (x.sep ? ' sep' : '')} onClick={() => onAles(x)}>
              {x.ic ? <Icon name={x.ic as IconName} size={17} /> : null}
              <span class="t">{x.text}</span>
              {x.sub ? <small>{x.sub}</small> : null}
            </button>
          ))}
          {!arata.length ? <div class="insp-al-gol">{items.length ? 'Nimic nu se potrivește.' : 'Lista e goală.'}</div> : null}
          {nota ? <div class="insp-al-nota">{nota}</div> : null}
        </div>
      </div>
    </div>
  );
}

// Notițele firmei: regulile casei, scrise o dată de administrator (web: insightNotite).
function Notite({ f, onInchide }: { f: Extract<Foaie, { fel: 'notite' }>; onInchide: () => void }) {
  const [text, setText] = useState(f.text);
  const [busy, setBusy] = useState(false);
  async function salveaza() {
    setBusy(true);
    try { await Api.saveInsightNotite(text); showToast('Notițele firmei s-au salvat ✓'); onInchide(); }
    catch (e: any) { showToast((e && e.message) || 'Nu s-au putut salva.', true); setBusy(false); }
  }
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) onInchide(); }}>
      <div class="sheet">
        <div class="sheet-h"><b>Notițele firmei pentru RA Insight</b><button class="h-btn" onClick={onInchide} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="insp-not-t">Regulile casei, pe care RA Insight le folosește la fiecare răspuns. De exemplu: „Motorina e 7,30 lei.”, „Grupa Distribuție = cele 8 dube.”, „La noi săptămâna de lucru e luni–sâmbătă.” Le văd toți cei cu RA Insight din firmă — nu scrie aici date personale.</div>
          <textarea class="insp-not-in" rows={8} value={text} maxLength={f.max || 1500} readOnly={!f.poateScrie} aria-label="Notițele firmei" onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
          {!f.poateScrie ? <div class="insp-not-i">Le scrie administratorul firmei.</div> : null}
          <div class="frm-actions insp-not-b">
            <button class="btn fl-btn2" disabled={busy} onClick={onInchide}>{f.poateScrie ? 'Renunță' : 'Închide'}</button>
            {f.poateScrie ? <button class="btn btn-primary" disabled={busy} onClick={salveaza}><Icon name="check" size={16} /> Salvează</button> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// „Azi la tine": ce au găsit agenții, sub salut — cel mult trei rânduri, fiecare apăsat O DATĂ. Rândurile și butoanele le scrie
// serverul (azi_la_tine.js). „De ce?" (o întrebare, doar cu AI) se vede pe rând, ca omul să știe că se numără.
function AziLaTine({ cuAi, poateRapoarte, laButon }: { cuAi: boolean; poateRapoarte: boolean; laButon: (b: any) => void }) {
  const [j, setJ] = useState<any | null>(null);
  useEffect(() => {
    let viu = true;
    Api.insightAzi().then((r) => { if (viu) setJ(r); }).catch(() => { /* fără „Azi la tine": salutul rămâne */ });
    return () => { viu = false; };
  }, []);
  if (!j || j.platforma || j.seatMissing || j.error) return null;
  const dv = Number(j.deVazut) || 0;
  const randuri: any[] = j.randuri || [];
  return (
    <div class="insp-azi">
      <div class="azi-cap">
        <span class="azi-tit">Azi la tine</span>
        <span class="azi-cand">{dv > 0 ? dv + ' de văzut' : 'de la agenți' + (j.la ? ' · ' + cand(j.la) : '')}</span>
      </div>
      {!randuri.length ? <div class="azi-gol">Agenții n-au găsit nimic de semnalat azi.</div> : null}
      {randuri.map((rd) => {
        const b = aziPrimul(rd, cuAi, poateRapoarte);
        const corp = <>
          <span class={'azi-st ' + nivelAzi(rd.nivel)} />
          <span class="azi-tx"><Gros text={rd.text} /></span>
          {b && b.fel === 'dece' ? <span class="azi-dece">{b.text}</span>
            : b && b.fel === 'propunere' ? <span class="azi-prop">{b.text}<Icon name="chevronR" size={13} /></span>
              : b ? <span class="azi-sg"><Icon name="chevronR" size={15} /></span> : null}
        </>;
        return b ? <button type="button" class="azi-r apas" onClick={() => laButon(b)}>{corp}</button> : <div class="azi-r">{corp}</div>;
      })}
    </div>
  );
}

// Caseta de scris: rotundă, cu „+", „Sursă externă", contorul și butonul de trimis (web: caseta).
function Caseta({ taRef, text, onText, onEnter, placeholder, contor, sursa, laPlus, laSursa, laTrimite, trimitere }: {
  taRef: { current: HTMLTextAreaElement | null }; text: string; onText: (v: string) => void; onEnter: () => void; placeholder: string; contor: string;
  sursa: ReturnType<typeof butonSursa>; laPlus: () => void; laSursa: () => void; laTrimite: () => void; trimitere: boolean;
}) {
  // Caseta crește cu textul, până la 140 px.
  useEffect(() => { const t = taRef.current; if (t) { t.style.height = 'auto'; t.style.height = Math.min(t.scrollHeight, 140) + 'px'; } }, [text]);
  const gol = !String(text || '').trim();
  return (
    <div class="chat-caseta">
      <textarea ref={taRef} rows={1} value={text} placeholder={placeholder} enterkeyhint="send"
        onInput={(e) => onText((e.target as HTMLTextAreaElement).value)}
        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); onEnter(); } }} />
      <div class="chat-unelte">
        <button type="button" class="chat-un chat-plus" onClick={laPlus} title="Adaugă mașina, perioada sau un raport" aria-label="Adaugă mașina, perioada sau un raport"><Icon name="plus" size={16} /></button>
        {sursa ? (
          <button type="button" class={'chat-un chat-sursa' + (sursa.on ? ' on' : '') + (sursa.gol ? ' gol' : '')} onClick={laSursa} aria-pressed={sursa.on ? 'true' : 'false'} aria-label={sursa.nume + (sursa.contor ? ', ' + sursa.contor : '')}>
            <Icon name="globe" size={15} /><span class="nr">{sursa.contor}</span>
          </button>
        ) : null}
        {contor ? <span class="chat-cnt" title="Cât a mai rămas luna asta">{contor}</span> : null}
        <button type="button" class={'chat-trimite' + (gol ? ' gol' : '')} disabled={trimitere} onClick={laTrimite} title="Trimite" aria-label="Trimite"><Icon name="arrowUp" size={18} /></button>
      </div>
      {sursa && sursa.nota ? <div class="chat-sursa-nota">{sursa.nota}</div> : null}
    </div>
  );
}

export function Insight() {
  const loc = useLocation();
  const { params, query } = useRoute();
  const ramuraCeruta = String((params as any).ramura || '');
  const admin = esteAdminFirma(me.value?.role);
  // Altă adresă = discuția. „Pachet și conturi" și „Vezi pachetele": doar administratorul firmei (ca pe web).
  const ramura = (ramuraCeruta === 'pachet' || ramuraCeruta === 'pachete') ? (admin ? ramuraCeruta : null)
    : (RAMURI_PE_TELEFON.indexOf(ramuraCeruta) >= 0 ? ramuraCeruta : null);
  const u = me.value;
  const poateRapoarte = !!(u?.isSuper || u?.permissions?.viewReports);
  const poateAgenti = !!(u?.features && u.features.agents !== false && u?.permissions?.viewReports);
  const [q, setQ] = useState<any | null>(null);
  const stare = stareDinQuota(q, !!u?.isSuper);
  const [conv, setConv] = useState<any | null>(null);
  const [mesaje, setMesaje] = useState<any[]>([]);
  const [lista, setLista] = useState<any[]>([]);
  const [faraLoc, setFaraLoc] = useState<string | null>(null);
  const [text, setTextS] = useState(ciornaMem);
  const setText = (v: string) => { ciornaMem = v; setTextS(v); };
  const [trimitere, setTrimitere] = useState(false);
  const [sursaOn, setSursaOn] = useState(false);
  const [sertar, setSertar] = useState(false);
  const [foaie, setFoaie] = useState<Foaie | null>(null);
  const [cautaDeschis, setCautaDeschis] = useState(false);
  const [cauta, setCauta] = useState('');
  const [detaliuFond, setDetaliuFond] = useState(false);
  const [jos, setJos] = useState(false);
  const [incarc, setIncarc] = useState(!!convCurenta);
  const [qGata, setQGata] = useState(false);          // pachetul e știut: o pagină de la Basic poate alege dacă e încuiată
  const [numere, setNumere] = useState<any>({});      // câte lucruri cer atenție în fiecare pagină (le numără serverul)
  const [paginiCerut, setPaginiCerut] = useState(false);
  const convRef = useRef<any>(null); convRef.current = conv;
  const ocupat = useRef(false);
  const dinButoane = useRef(false);     // întrebarea e făcută doar din butoane → pleacă cu `buton: true`
  const rapoarte = useRef<Rand[] | null>(null);
  const taRef = useRef<HTMLTextAreaElement | null>(null);
  const boxRef = useRef<HTMLDivElement | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const cautaT = useRef<any>(null);

  useInapoiInchide(sertar, () => { setSertar(false); return true; });
  useInapoiInchide(!!foaie, () => { setFoaie(null); return true; });
  // Un drum pornit din sertar sau dintr-o foaie: întâi se închid ele (își scot intrarea din istoric), abia apoi se schimbă adresa,
  // ca „Înapoi" dintr-o pagină să ducă direct la discuție.
  const sertarRef = useRef(false); sertarRef.current = sertar;
  const foaieRef = useRef(false); foaieRef.current = !!foaie;
  const deMers = useRef<{ ruta: string; inlocuieste: boolean } | null>(null);
  function du(ruta: string, inlocuieste = false) {
    if (sertarRef.current || foaieRef.current) { deMers.current = { ruta, inlocuieste }; setSertar(false); setFoaie(null); }
    else loc.route(ruta, inlocuieste);
  }
  useEffect(() => {
    if (sertar || foaie || !deMers.current) return;
    const d = deMers.current; deMers.current = null;
    dupaInapoi(() => loc.route(d.ruta, d.inlocuieste));
  }, [sertar, !!foaie]);

  async function incarcaPachet() {
    let r: any = null;
    try { r = await Api.aiQuota(); } catch { /* fără contor: rândul de jos nu apare */ }
    setQ(r); setQGata(true);
    const st = stareDinQuota(r, !!me.value?.isSuper);
    if (!st.sursaInfo || !st.sursaInfo.poate) setSursaOn(false);
  }
  // Pachetul sau conturile s-au schimbat: contorul, „Domenii" și locul omului se citesc din nou.
  function dupaPachet() { incarcaPachet(); incarcaLista(); incarcaNumere(); }
  async function incarcaLista(cuvant?: string) {
    const c = cuvant != null ? cuvant : cauta;
    try {
      const r: any = await Api.insightConversatii(c.trim());
      const refuz = textFaraLoc(r);
      if (refuz) { setFaraLoc(refuz); setLista([]); return; }
      setFaraLoc(null);
      setLista(r.conversatii || []);
    } catch (e: any) {
      if (e && (e.status === 403 || e.status === 401)) {
        setFaraLoc((e.data && e.data.message) || e.message || 'RA Insight nu e pornit pe contul tău.');
        setLista([]);
      }
    }
  }
  async function incarcaNumere() {
    try { setNumere((await Api.insightRamuri()) || {}); } catch { setNumere({}); }   // pe Start nu se arată niciun număr
  }
  function nou() {
    setConv(null); setMesaje([]); convCurenta = null; setSursaOn(false);
    if (ramura) du('/insight', true); else setSertar(false);
  }
  async function incarcaConv(id: any) {
    setIncarc(true);
    try {
      const r: any = await Api.insightConversatie(id);
      setConv(r.conversatie); setMesaje(r.mesaje || []); convCurenta = r.conversatie.id; setSursaOn(false);
    } catch {
      if (convCurenta === id) convCurenta = null;
      setConv(null); setMesaje([]);
    }
    setIncarc(false);
  }
  async function deschide(id: any) {
    await incarcaConv(id);
    if (ramura) du('/insight', true); else setSertar(false);
  }
  // O pagină sau „Conversație nouă" din meniu: aceeași cale, iar dintr-o pagină în alta se înlocuiește adresa.
  function deschidePagina(k: string) { du(rutaRamura(k), !!ramura); }
  // „Vezi pachetele": pe web, o fereastră peste pagina de sub ea; aici o adresă adăugată, deci „Înapoi" duce pe pagina de sub ea.
  function vedePachetele() { du(rutaRamura('pachete')); }
  // „Întreabă RA Insight" dintr-o pagină: o discuție nouă, cu începutul întrebării scris (nu pleacă singură).
  function intreabaDespre(inceput: string) {
    setConv(null); setMesaje([]); convCurenta = null; setSursaOn(false);
    setText(String(inceput || '')); dinButoane.current = false; focusCiorna = true;
    du('/insight', true);
  }

  useEffect(() => {
    incarcaPachet();
    incarcaLista('');
    incarcaNumere();
  }, []);
  // Pe discuție: conversația ținută minte se redeschide (la întoarcerea dintr-un raport sau dintr-o pagină).
  useEffect(() => {
    if (ramura) return;
    if (convCurenta && !(conv && conv.id === convCurenta)) incarcaConv(convCurenta); else setIncarc(false);
    if (focusCiorna) { focusCiorna = false; setTimeout(() => { if (taRef.current) taRef.current.focus(); }, 60); }
  }, [ramura]);

  // Tastatura: unde fereastra nu se strânge singură, caseta urcă deasupra ei.
  useEffect(() => {
    const vv = window.visualViewport;
    if (!vv) return;
    const f = () => { if (rootRef.current) rootRef.current.style.setProperty('--insp-kb', Math.max(0, window.innerHeight - vv.height - vv.offsetTop) + 'px'); };
    vv.addEventListener('resize', f); vv.addEventListener('scroll', f); f();
    return () => { vv.removeEventListener('resize', f); vv.removeEventListener('scroll', f); };
  }, []);

  // Discuția se derulează jos doar când apare un mesaj nou, nu la 👍 sau la o apăsare pe un cartonaș.
  useEffect(() => { const b = boxRef.current; if (b) { b.scrollTop = b.scrollHeight; arataJos(); } }, [mesaje.length, trimitere, ramura]);
  function arataJos() { const b = boxRef.current; if (b) setJos(b.scrollHeight - b.scrollTop - b.clientHeight > 220); }

  // `opt.buton` = întrebarea vine de pe un buton (cartonaș, continuare, alegere) sau e făcută doar din butoanele casetei: pe Basic /
  // Pro / Business răspund regulile, fără să se numere. Scrisă de mână = o întrebare.
  async function trimite(textDat?: string, opt?: { buton?: boolean }) {
    const msg = String(textDat != null ? textDat : text).trim();
    if (!msg || ocupat.current) return;
    const buton = !!(opt && opt.buton) || (textDat == null && dinButoane.current);
    setText(''); dinButoane.current = false;
    ocupat.current = true; setTrimitere(true);
    setMesaje((l) => l.concat([{ rol: 'user', text: msg }]));
    try {
      const j: any = await Api.insightIntreaba(corpIntrebare(msg, { buton, sursa: sursaOn, conversatieId: convRef.current && convRef.current.id }));
      primeste(j);
    } catch (e: any) {
      if (e && e.data && (e.data.reply || e.data.message || e.data.error)) {
        if (e.status === 404) { setConv(null); convCurenta = null; }
        primeste(e.data);
      } else {
        setMesaje((l) => l.concat([{ rol: 'assistant', text: e && e.status != null ? String(e.message) : 'Eroare de rețea: ' + (e && e.message), extra: {} }]));
      }
    }
    ocupat.current = false; setTrimitere(false);
  }
  function primeste(j: any) {
    if (j.conversatieId) {
      setConv((c: any) => (c && c.id === j.conversatieId ? c : { id: j.conversatieId }));
      convCurenta = j.conversatieId;
    }
    setMesaje((l) => l.concat([mesajDinRaspuns(j)]));
    // „Arată-mi potrivirea șoferilor": răspunsul rămâne în discuție, iar pagina se deschide singură — dacă omul e încă pe discuție.
    if (j.pagina && RAMURI_PE_TELEFON.indexOf(String(j.pagina)) >= 0) setTimeout(() => { if (window.location.pathname === '/insight') loc.route(rutaRamura(j.pagina)); }, 450);
    incarcaPachet();
    incarcaLista();
  }
  // Din „+": mașina și perioada se pun în text, unde e cursorul. Tastatura nu se deschide: omul poate trimite direct.
  function puneInText(bucata: string) {
    const t = taRef.current;
    const r = punInText(text, t ? t.selectionStart : null, t ? t.selectionEnd : null, bucata, dinButoane.current);
    dinButoane.current = r.buton;
    setText(r.text);
    requestAnimationFrame(() => { const t2 = taRef.current; if (t2) { try { t2.setSelectionRange(r.cursor, r.cursor); } catch { /* */ } } });
  }
  function alegeMasina() {
    const arata = (l: any[]) => setFoaie({ fel: 'alege', titlu: 'Alege mașina', items: l, la: (x) => puneInText(String(x.pune)) });
    if (masiniMem && Date.now() - masiniMem.t < 120000) { arata(masiniMem.l); return; }
    Api.devices().then((d: any) => {
      const l = masiniAlegere(d).map((x) => Object.assign({ ic: 'car' }, x));
      masiniMem = { t: Date.now(), l };
      arata(l);
    }).catch(() => arata([]));
  }
  function alegePerioada() {
    setFoaie({ fel: 'alege', titlu: 'Alege perioada', items: PERIOADE.map((x) => Object.assign({ ic: 'calendar' }, x)), la: (x) => puneInText(String(x.pune)) });
  }
  // „Raport": rapoartele pe care le poți cere în cuvinte — lista o dă serverul, cu drepturile tale. Alesul pune „Fă-mi raportul „…”" în casetă.
  async function alegeRaport() {
    if (!rapoarte.current) {
      try {
        const r: any = await Api.insightRapoarte();
        rapoarte.current = (r.rapoarte || []).map((x: any) => ({ text: String(x.text || ''), sub: String(x.sub || ''), pune: String(x.pune || ''), ic: 'report' }));
      } catch (e: any) { showToast((e && e.message) || 'Nu am putut încărca rapoartele.', true); return; }
    }
    setFoaie({ fel: 'alege', titlu: 'Ce raport fac?', items: rapoarte.current || [], la: (x) => puneInText(String(x.pune)) });
  }
  function plus() {
    setFoaie({ fel: 'alege', titlu: 'Adaugă', items: listaPlus(poateRapoarte), la: (x) => { if (x.k === 'm') alegeMasina(); else if (x.k === 'p') alegePerioada(); else alegeRaport(); } });
  }
  // „Sursă externă": pornit doar pentru discuția de acum — o discuție nouă (sau una redeschisă) pornește cu el oprit.
  function comutaSursa() {
    const si = stare.sursaInfo; if (!si) return;
    if (!si.poate && !sursaOn) { showToast(String(si.nota || ''), true); return; }
    setSursaOn(!sursaOn);
  }
  async function deschideNotite() {
    try {
      const j: any = await Api.insightNotite();
      setFoaie({ fel: 'notite', text: j.text || '', max: j.max || 1500, poateScrie: !!j.poateScrie });
    } catch (e: any) { showToast((e && e.message) || 'Notițele nu s-au putut încărca.', true); }
  }
  // „⋯": tot ce nu stă pe ecran, într-un singur loc.
  function meniu() {
    const id = conv && conv.id;
    setFoaie({ fel: 'alege', titlu: 'RA Insight', items: listaMeniu({ areConv: !!id, peRamura: !!ramura, poateAgenti, poatePachet: arataPachetConturi(admin, stare.pachet, faraLoc) }), nota: NOTA_MENIU, la: (x) => {
      if (x.k === 'nou') nou();
      else if (x.k === 'pachet') deschidePagina('pachet');
      else if (x.k === 'notite') deschideNotite();
      else if (x.k === 'agenti') du('/ai-agents');
      else if (x.k === 'ghid') deschidePagina('ghid');
      else if (x.k === 'r') cereRedenumire(id);
      else if (x.k === 's') setFoaie({ fel: 'sterge', id });
    } });
  }
  function cereRedenumire(id: any) {
    const c = lista.filter((x) => x.id === id)[0] || {};
    setFoaie({ fel: 'redenumeste', id, titlu: c.titlu || '' });
  }
  async function redenumeste(id: any, nume: string) {
    const t = String(nume || '').trim();
    if (!t) return;
    try {
      await Api.insightRedenumeste(id, t);
      if (convRef.current && convRef.current.id === id) setConv(Object.assign({}, convRef.current, { titlu: t }));
      setFoaie(null);
      incarcaLista();
    } catch (e: any) { showToast((e && e.message) || 'Nu s-a putut redenumi.', true); }
  }
  async function sterge(id: any) {
    try {
      await Api.insightSterge(id);
      if (convRef.current && convRef.current.id === id) { setConv(null); setMesaje([]); convCurenta = null; }
      setFoaie(null);
      incarcaLista();
    } catch (e: any) { showToast((e && e.message) || 'Nu s-a putut șterge.', true); }
  }
  async function nota(m: any, v: number) {
    const noua = m.feedback === v ? 0 : v;
    try { await Api.insightFeedback(m.id, noua); } catch { return; }
    setMesaje((l) => l.map((z) => (z.id === m.id ? Object.assign({}, z, { feedback: noua || null }) : z)));
    if (noua) showToast(noua > 0 ? 'Mulțumim! Ne ajută să știm ce merge.' : 'Mulțumim — ne uităm la ce n-a mers.');
  }
  // Serverul a răspuns la o apăsare pe un cartonaș: bula se desenează din nou, iar pasul următor (dacă e unul) vine ca mesaj nou.
  function propunere(m: any, id: any, noua: any, urmator: any) {
    setMesaje((l) => {
      let out = l.map((z) => {
        if (z !== m && (m.id == null || z.id !== m.id)) return z;
        const x = Object.assign({}, z.extra);
        if (noua) {
          if (x.propunere && x.propunere.id === id) x.propunere = noua;
          if (Array.isArray(x.propuneri)) x.propuneri = x.propuneri.map((q: any) => (q && q.id === id ? noua : q));
        }
        return Object.assign({}, z, { extra: x });
      });
      const un = mesajUrmator(urmator);
      if (un) out = out.concat([un]);
      return out;
    });
  }
  function laCauta(v: string) {
    setCauta(v);
    clearTimeout(cautaT.current);
    cautaT.current = setTimeout(() => incarcaLista(v), 250);
  }
  function comutaCauta() {
    if (cautaDeschis && cauta) { setCauta(''); incarcaLista(''); }
    setCautaDeschis(!cautaDeschis);
  }
  function aziApasa(b: any) {
    const a = aziActiune(b, stare.pachet);
    if (!a) return;
    if (a.ruta) loc.route(a.ruta);
    else if (a.trimite) trimite(a.trimite, a.buton ? { buton: true } : undefined);
  }

  const l: Laturi = {
    trimite: (t, o) => trimite(t, o),
    buton: (b, p) => { const r = rutaButon(b, p); if (r) loc.route(r); },
    ruta: (r) => loc.route(r),
    plus,
    nota,
    propunere,
    editeaza: (t) => { setText(String(t || '')); dinButoane.current = false; setTimeout(() => { if (taRef.current) taRef.current.focus(); }, 30); },
    pachete: admin ? vedePachetele : undefined,
  };
  // Ce pot face paginile: o întrebare nouă, un ecran al aplicației, altă pagină.
  const lPag: LaPagina = {
    numere: incarcaNumere,
    act: (a) => {
      if (a.fel === 'intreaba') intreabaDespre(a.inceput);
      else if (a.fel === 'ecran') { const r = rutaButon({ fel: 'ecran', ecran: a.ecran }); if (r) loc.route(r); }
      else if (a.fel === 'ramura') deschidePagina(a.k);
    },
  };

  const caseta = (
    <Caseta taRef={taRef} text={text} placeholder={placeholderCaseta(stare.peReguli, stare.pachet, poateRapoarte)} contor={stare.contor}
      sursa={butonSursa(stare.sursaInfo, stare.peReguli, sursaOn)} trimitere={trimitere}
      onText={(v) => { dinButoane.current = false; setText(v); }} onEnter={() => trimite()} laPlus={plus} laSursa={comutaSursa} laTrimite={() => trimite()} />
  );
  const rPag = ramuraDupa(ramura);
  const titlu = rPag ? rPag.et : ramura === 'pachet' ? TITLU_CONTURI : ramura === 'pachete' ? TITLU_PACHETE : (conv ? (conv.titlu || (lista.filter((c) => c.id === conv.id)[0] || {}).titlu || 'Conversație') : 'RA Insight');
  const pagDesc = paginiDeschise(paginiCerut, ramura);
  const totNumere = sumaNumere(numere, stare.pachet);
  const ult = mesaje[mesaje.length - 1];
  const urmari = ult && ult.rol !== 'user' && !trimitere && ult.extra && Array.isArray(ult.extra.urmari) ? ult.extra.urmari : [];
  let ultimulGrup: string | null = null;

  return (
    <div class={'screen insp' + (sertar ? ' st-deschis' : '')} ref={rootRef}>
      <header class="app-header">
        <button class="h-btn" onClick={() => { if (!ramura) loc.route('/meniu'); else if (history.length > 1) history.back(); else loc.route('/insight', true); }} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <button class="h-btn" onClick={() => setSertar(!sertar)} title="Conversații" aria-label="Conversații"><Icon name="menu" /></button>
        <div class="h-title">{titlu}</div>
        <button class="h-btn" onClick={meniu} title="Mai multe" aria-label="Mai multe"><Icon name="ellipsis" /></button>
      </header>

      {sertar ? <div class="insp-umbra" onClick={() => setSertar(false)} /> : null}
      <aside class="insp-st" aria-hidden={sertar ? undefined : 'true'}>
        <div class="insp-st-tit"><span class="insp-stea"><Icon name="sparkles" size={15} /></span>RA Insight</div>
        <button type="button" class="insp-nou" onClick={nou}><Icon name="plus" size={16} />Conversație nouă</button>
        <button type="button" class="insp-cauta-r" onClick={comutaCauta}><Icon name="search" size={16} />Caută în conversații</button>
        {cautaDeschis ? <input class="insp-cauta" type="search" placeholder="Caută în conversațiile tale" value={cauta} onInput={(e) => laCauta((e.target as HTMLInputElement).value)} /> : null}
        <div class="insp-lista">
          {faraLoc ? <div class="insp-gol">—</div>
            : !lista.length ? <div class="insp-gol">{cauta ? 'Nicio conversație nu conține ce cauți.' : 'Încă nicio conversație. Pune prima întrebare în dreapta.'}</div>
              : lista.map((c) => {
                const g = grup(c.actualizat_la);
                const cap = g !== ultimulGrup ? <div class="insp-zi">{g}</div> : null;
                ultimulGrup = g;
                return <>
                  {cap}
                  <div class={'insp-conv' + (!ramura && conv && conv.id === c.id ? ' act' : '')}>
                    <button type="button" class="t" onClick={() => deschide(c.id)}>{c.titlu || 'Conversație'}</button>
                    <button type="button" class="a" title="Redenumește" aria-label="Redenumește" onClick={() => { setSertar(false); cereRedenumire(c.id); }}><Icon name="edit" size={15} /></button>
                    <button type="button" class="a" title="Șterge" aria-label="Șterge" onClick={() => { setSertar(false); setFoaie({ fel: 'sterge', id: c.id }); }}><Icon name="trash" size={15} /></button>
                  </div>
                </>;
              })}
        </div>
        <div class="insp-st-jos">
          {/* „Domenii" (până pe 05.11 „Pagini"): închise, cu câte lucruri cer atenție în toate; deschise când omul le cere sau stă pe una din ele. */}
          <button type="button" class={'insp-pag' + (pagDesc ? ' desc' : '')} aria-expanded={pagDesc ? 'true' : 'false'}
            onClick={() => { const urm = !pagDesc; setPaginiCerut(urm || !!(rPag && pagini().indexOf(rPag) >= 0)); }}>
            <Icon name="layers" size={16} /><span>Domenii</span>
            {totNumere > 0 && !pagDesc ? <span class="insp-nr">{totNumere}</span> : null}
            <Icon name="chevronR" size={15} class="insp-pag-s" />
          </button>
          {pagDesc ? (
            <div class="insp-ramuri">
              {pagini().map((r) => {
                const inc = ramuraIncuiata(r, stare.pachet);
                const n = numere && numere[r.k];
                return (
                  <button type="button" class={'insp-ram' + (ramura === r.k ? ' act' : '') + (inc ? ' lock' : '')} onClick={() => deschidePagina(r.k)}>
                    <span class="ic"><Icon name={(inc ? 'lock' : r.ic) as IconName} size={15} /></span>
                    <span class="t">{r.et}{r.sub ? <span class="insp-ram-sub">{r.sub}</span> : null}{inc ? <span class="insp-ram-pk">· Basic</span> : null}</span>
                    {n > 0 ? <span class="insp-nr">{n}</span> : null}
                  </button>
                );
              })}
            </div>
          ) : null}
          {/* Rândul pachetului: administratorul ajunge din el în „Pachet și conturi"; ceilalți îi văd amănuntul (pe web, la mouse). */}
          {stare.fond ? <button type="button" class={'insp-fond' + (stare.fond.avert ? ' w' : '') + (admin && stare.pachet ? ' link' : '')}
            onClick={() => { if (admin && stare.pachet) deschidePagina('pachet'); else setDetaliuFond(!detaliuFond); }}>{stare.fond.text}</button> : null}
          {stare.fond && detaliuFond && stare.fond.detaliu ? <div class="insp-fond-d">{stare.fond.detaliu}</div> : null}
        </div>
      </aside>

      <main class="insp-main">
        {/* „Pachet și conturi" stă ÎNAINTEA cartonașului „nu e pornit": un administrator care le-a dat colegilor toate conturile n-are
            alt drum spre ele (din Utilizatori nu se mai dau). */}
        {ramura === 'pachet' ? <PaginaPachetConturi laPachete={vedePachetele} onSchimbat={dupaPachet} />
        : ramura === 'pachete' ? <PaginaPachete onSchimbat={dupaPachet} />
        : faraLoc ? (
          <div class="insp-gol-mij"><div class="insp-card"><h3>RA Insight nu e pornit pe contul tău</h3><div>{faraLoc}</div>
            {admin ? <>
              <div class="insp-card-adm">{TEXT_ADMIN_FARA_LOC}</div>
              <div class="insp-card-b"><ButonProp text="Deschide Pachet și conturi" ic="layers" onClick={() => deschidePagina('pachet')} /></div>
            </> : null}
          </div></div>
        ) : ramura ? (
          !qGata && rPag && rPag.pachet ? <div class="sdp"><div class="insp-gol">Se încarcă…</div></div>
            : ramuraIncuiata(rPag, stare.pachet) ? <PaginaIncuiata k={ramura} laPachete={admin ? vedePachetele : undefined} />
              : <PaginaRamura k={ramura} l={lPag} />
        ) : incarc ? (
          <div class="insp-gol-mij"><div class="spin insp-spin" /></div>
        ) : !mesaje.length ? (
          <div class="insp-gol-mij">
            <div class="insp-salut">
              <h2>{textSalut(u?.prenume)}</h2>
              {caseta}
              <div class="insp-chips">
                {(stare.peReguli ? CARDURI_REGULI : CARDURI).map((c) => <button type="button" class="insp-chip" onClick={() => trimite(c.q, { buton: true })}>{c.t}</button>)}
              </div>
              <AziLaTine cuAi={areAi(stare.peReguli, stare.pachet)} poateRapoarte={poateRapoarte} laButon={aziApasa} />
            </div>
          </div>
        ) : (
          <>
            <div class="insp-msgs" ref={boxRef} onScroll={arataJos}>
              {mesaje.map((m) => (m.rol === 'user' ? <BulaOm text={m.text} l={l} /> : <BulaAi m={m} l={l} />))}
              {urmari.length ? <Urmari urmari={urmari} l={l} /> : null}
              {trimitere ? <div class="insp-a"><div class="av"><Icon name="sparkles" size={14} /></div><div class="bub"><div class="chat-typing"><span /><span /><span /></div></div></div> : null}
            </div>
            {jos ? <button type="button" class="chat-jos" title="La ultimul mesaj" aria-label="La ultimul mesaj" onClick={() => { const b = boxRef.current; if (b) b.scrollTo({ top: b.scrollHeight, behavior: 'smooth' }); }}><Icon name="arrowDown" size={18} /></button> : null}
            <div class="insp-scrie">{caseta}</div>
          </>
        )}
      </main>

      {foaie && foaie.fel === 'alege' ? <Alege titlu={foaie.titlu} items={foaie.items} nota={foaie.nota} onInchide={() => setFoaie(null)} onAles={(x) => { const la = foaie.la; setFoaie(null); la(x); }} /> : null}
      {foaie && foaie.fel === 'notite' ? <Notite f={foaie} onInchide={() => setFoaie(null)} /> : null}
      {foaie && foaie.fel === 'redenumeste' ? (
        <Confirma title="Redenumește conversația" text="Un nume după care o recunoști ușor în listă." okLabel="Salvează" field={{ label: 'Numele conversației', value: foaie.titlu }}
          onCancel={() => setFoaie(null)} onOk={(v) => redenumeste(foaie.id, String(v || ''))} />
      ) : null}
      {foaie && foaie.fel === 'sterge' ? (
        <Confirma title="Ștergi conversația?" text="Conversația se șterge de tot și nu se mai poate recupera." okLabel="Șterge" danger
          onCancel={() => setFoaie(null)} onOk={() => sterge(foaie.id)} />
      ) : null}
    </div>
  );
}
