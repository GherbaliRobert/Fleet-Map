import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { salveazaDeLaServer } from '../lib/export';
import './detail.css';
import './admin.css';

// Panoul Mail (Robert, 12.10: „noi adminii să avem un panou de mail" — „și pe telefon, bineînțeles"), ca pe web
// (Business → Mail): etapa 1 „Trimise" + „Scrie", etapa 2 „Primite" + „Răspunde"; 13.10: „Răspunde tuturor", „Redirecționează",
// semnătura și chenarul cu sigla (pus de server); apoi (Robert: „un mail cât mai complet") dosarele Primite · Trimise · Ciorne ·
// Spam · Coș, bifele cu acțiuni pe mai multe deodată, steaua, butoanele direct pe rând, ciornele salvate singure și adresele
// sugerate. Telefonul NU hotărăște nimic: ce adrese vezi (adresa comună + a ta), câte sunt necitite, starea fiecărui email,
// spațiul ocupat, felul emailului, ce face o acțiune și textul de după, câte zile stă ceva în Coș / Spam și ce se pune în
// răspuns le dă serverul. Aceleași cuvinte ca pe web.
// Pe telefon, linkurile din emailurile primite rămân oprite (cadrul gol, sandbox=""): o filă nouă deschisă din cadru
// n-are unde să meargă în aplicație și ar putea scoate omul din ea. Butoanele de pe rând stau mereu la vedere (pe web apar
// la trecerea mouse-ului; pe un ecran tactil, tot mereu).

function oct(n: any): string {
  const v = Number(n) || 0;
  if (v >= 1073741824) return (v / 1073741824).toLocaleString('ro-RO', { maximumFractionDigits: 2 }) + ' GB';
  if (v >= 1048576) return (v / 1048576).toLocaleString('ro-RO', { maximumFractionDigits: 1 }) + ' MB';
  if (v >= 1024) return Math.round(v / 1024) + ' KB';
  return v + ' B';
}
// „1 email”, „5 emailuri”, „20 de emailuri” — ca pe web (_mailNumar).
function numar(n: any): string {
  const v = Number(n) || 0, r = v % 100;
  return v === 1 ? '1 email' : v + (r >= 1 && r <= 19 ? ' emailuri' : ' de emailuri');
}
function cand(iso: any): string {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('ro-RO', { day: '2-digit', month: '2-digit', year: 'numeric' }) + ' ' + d.toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' });
}
const deLa = (m: any) => (m.de_nume ? m.de_nume + ' <' + (m.de_la || '') + '>' : (m.de_la || '—'));
function citeste(f: File): Promise<{ nume: string; b64: string }> {
  return new Promise((ok, nu) => {
    const r = new FileReader();
    r.onload = () => ok({ nume: f.name, b64: String(r.result).split(',')[1] || '' });
    r.onerror = () => nu(r.error);
    r.readAsDataURL(f);
  });
}
type Dosar = 'primite' | 'trimise' | 'ciorne' | 'spam' | 'cos';
// Dosarele, în ordinea de pe web (_MAIL_FILE).
const DOSARE: [Dosar, string][] = [['primite', 'Primite'], ['trimise', 'Trimise'], ['ciorne', 'Ciorne'], ['spam', 'Spam'], ['cos', 'Coș']];
const GOL: Record<Dosar, string> = { primite: 'Niciun email primit încă.', trimise: 'Niciun email trimis încă.', ciorne: 'Nicio ciornă.', spam: 'Spamul e gol.', cos: 'Coșul e gol.' };
const chip = (on: boolean) => 'padding:7px 12px;border-radius:9px;font-size:12.5px;font-weight:700;font-family:inherit;border:1px solid var(--border);cursor:pointer;display:inline-flex;align-items:center;gap:5px;'
  + (on ? 'background:var(--accent);color:#06210F' : 'background:var(--bg-dark);color:var(--text-primary)');
const fila = (on: boolean) => 'flex:0 0 auto;padding:10px 12px;font:inherit;font-size:14px;font-weight:700;background:none;border:0;cursor:pointer;white-space:nowrap;border-bottom:2px solid '
  + (on ? 'var(--accent);color:var(--text-primary)' : 'transparent;color:var(--text-secondary)');
const bulina = (gri: boolean) => 'display:inline-block;min-width:18px;text-align:center;padding:1px 6px;border-radius:999px;font-size:11px;font-weight:800;margin-left:6px;'
  + (gri ? 'background:var(--bg-dark);color:var(--text-secondary);border:1px solid var(--border)' : 'background:var(--accent);color:#06210F');
const camp = 'width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-dark);color:var(--text-primary);font:inherit;font-size:15px';
const eticheta = 'display:block;font-size:12px;font-weight:700;color:var(--text-secondary);margin:12px 0 5px';
const aviz = (rosu: boolean) => 'border-radius:10px;padding:9px 12px;font-size:12.5px;line-height:1.45;margin-bottom:10px;border:1px solid '
  + (rosu ? 'rgba(239,68,68,.45);background:rgba(239,68,68,.10);color:var(--text-primary)' : 'rgba(245,158,11,.45);background:rgba(245,158,11,.10);color:var(--text-primary)');
const btnAlt = 'background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)';
const ib = 'width:34px;height:34px;border-radius:9px;border:1px solid var(--border);background:var(--bg-dark);color:var(--text-secondary);display:inline-flex;align-items:center;justify-content:center;cursor:pointer;padding:0';
const nota = 'font-size:12px;color:var(--text-secondary);line-height:1.45;margin-bottom:8px';
// Steaua aprinsă: chihlimbar (o pictogramă, nu text: ≥ 3:1 pe ambele teme).
const STEA = '#d97706';

type El = { sursa: string; id: number };

export function Mail() {
  const loc = useLocation();
  const isSuper = !!me.value?.isSuper;
  const [tab, setTab] = useState<Dosar>('primite');
  const [meta, setMeta] = useState<any | null>(null);
  const [lista, setLista] = useState<any[] | null>(null);
  const [maiSunt, setMaiSunt] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [filtru, setFiltru] = useState('');
  const [cauta, setCauta] = useState('');
  const [stea, setStea] = useState(false);
  const [bifate, setBifate] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState('');
  const [deschis, setDeschis] = useState<any | null>(null);
  const [imagini, setImagini] = useState(false);
  const [scrie, setScrie] = useState(false);
  const [busy, setBusy] = useState(false);
  type Form = { de_la: string; catre: string; cc: string; subiect: string; text: string; raspunsLa: number | null; tuturor?: boolean;
    redir?: { primit?: number; trimis?: number } | null; atasamenteRedir?: any[]; faraAtasamente?: boolean };
  const [form, setForm] = useState<Form>({ de_la: '', catre: '', cc: '', subiect: '', text: '', raspunsLa: null });
  const formRef = useRef(form); formRef.current = form;
  const [ciornaSt, setCiornaSt] = useState('');
  const ciornaId = useRef<number | null>(null);
  const ciornaT = useRef<any>(null);
  const [sug, setSug] = useState<{ camp: 'catre' | 'cc'; lista: any[] } | null>(null);
  const sugT = useRef<any>(null);
  const fisRef = useRef<HTMLInputElement>(null);
  const cautaT = useRef<any>(null);
  const seq = useRef(0);

  async function incarcaMeta() {
    try {
      const m = await Api.mailAdrese();
      setMeta(m);
      if (filtru && !(m.adrese || []).some((x: any) => x.adresa === filtru)) setFiltru('');
    } catch (e: any) { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Nu s-a putut încărca panoul de mail.')); }
  }
  async function incarcaLista(p: number, adauga: boolean, f = filtru, q = cauta, t: Dosar = tab, st = stea) {
    const s = ++seq.current;
    try {
      let rows: any[] = [], mai = false;
      if (t === 'ciorne') rows = ((await Api.mailCiorne()).ciorne || []).map((x: any) => ({ ...x, _s: 'ciorna' }));
      else {
        const q2 = { adresa: f || undefined, cauta: q || undefined, pagina: p, stea: st || undefined };
        const j = t === 'trimise' ? await Api.mailTrimise(q2) : t === 'spam' ? await Api.mailPrimite({ ...q2, stea: undefined, dosar: 'spam' })
          : t === 'cos' ? await Api.mailCos({ adresa: f || undefined, pagina: p }) : await Api.mailPrimite(q2);
        rows = (j.mailuri || []).map((m: any) => ({ ...m, _s: t === 'trimise' ? 'trimis' : t === 'cos' ? m.sursa : 'primit' }));
        mai = !!j.maiSunt;
      }
      if (s !== seq.current) return;   // între timp s-a schimbat fila sau căutarea
      setLista((v) => (adauga && v ? v.concat(rows) : rows));
      setMaiSunt(mai); setPagina(p);
    } catch (e: any) { if (s === seq.current) { setErr(e?.message || 'Nu s-a putut încărca lista.'); setLista([]); } }
  }
  function reload() { setErr(''); setLista(null); setBifate({}); incarcaMeta(); incarcaLista(0, false); }
  useEffect(() => { if (isSuper) reload(); }, []);
  useEffect(() => { if (isSuper && meta) { setLista(null); setBifate({}); incarcaLista(0, false); } }, [filtru, tab, stea]);

  function schimbaFila(t: Dosar) { if (t === tab) return; setCauta(''); setStea(false); setTab(t); }
  function laCautare(v: string) {
    setCauta(v);
    clearTimeout(cautaT.current);
    cautaT.current = setTimeout(() => incarcaLista(0, false, filtru, v.trim()), 350);
  }
  const cheie = (m: any) => m._s + ':' + Number(m.id);
  const el1 = (m: any): El[] => [{ sursa: m._s, id: Number(m.id) }];
  async function deschide(m: any) {
    if (m._s === 'ciorna') { deschideCiorna(m); return; }
    setImagini(false);
    setDeschis({ incarca: true });
    try {
      if (m._s === 'primit') {
        const d = await Api.mailPrimit(m.id);
        setDeschis({ ...d, primit: true });
        // Deschis = citit (l-a trecut serverul): rândul și bulinele se schimbă pe loc.
        setLista((v) => (v || []).map((x) => (x._s === 'primit' && x.id === m.id ? { ...x, citit: true } : x)));
        incarcaMeta();
      } else setDeschis(await Api.mailTrimis(m.id));
    } catch (e: any) { setDeschis(null); showToast(e?.message || 'Emailul nu se poate deschide.', true); }
  }
  // O singură cale pentru acțiuni (rândul, bara cu bifele, fereastra emailului): serverul le face și scrie textul de după.
  async function actiune(act: string, el: El[]) {
    if (!el.length) return;
    if (act === 'definitiv' && !confirm((el.length === 1 ? 'Ștergi definitiv emailul, cu atașamentele lui?' : 'Ștergi definitiv ' + el.length + ' emailuri, cu atașamentele lor?') + ' Nu se mai poate recupera.')) return;
    try {
      const r = await Api.mailActiune(act, el);
      showToast(r?.text || 'Gata.');
      setBifate({}); setDeschis(null); reload();
    } catch (e: any) { showToast(e?.message || 'Nu s-a putut.', true); }
  }
  async function stergeCiorne(ids: number[]) {
    let n = 0;
    for (const id of ids) { try { await Api.mailStergeCiorna(id); n++; } catch (e) { /* se numără doar cele șterse */ } }
    showToast(n === 1 ? 'Ciorna a fost ștearsă.' : n + ' ciorne șterse.', !n);
    reload();
  }
  function nou(pre?: any) {
    if (!meta?.activ) { showToast('Serverul n-are email configurat.', true); return; }
    const adr = meta.adrese || [];
    const aMea = adr.find((x: any) => x.aMea);
    const implicit = (aMea || adr.find((x: any) => x.comuna) || adr[0] || {}).adresa || '';
    // Redirecționarea pleacă implicit de pe adresa emailului (dacă e a ta), dar se poate alege alta; răspunsul — doar de pe ea.
    const deLaPre = pre && pre.de_la && adr.some((x: any) => x.adresa === pre.de_la) ? pre.de_la : implicit;
    if (pre) setForm({ de_la: pre.raspunsLa ? pre.de_la : deLaPre, catre: pre.catre || '', cc: pre.cc || '', subiect: pre.subiect || '', text: pre.text || '',
      raspunsLa: pre.raspunsLa || null, tuturor: !!pre.tuturor, redir: pre.redir || null, atasamenteRedir: pre.atasamenteRedir || [], faraAtasamente: !!pre.faraAtasamente });
    else setForm({ de_la: implicit, catre: '', cc: '', subiect: '', text: '', raspunsLa: null });
    ciornaId.current = pre && pre.ciorna ? pre.ciorna : null;
    clearTimeout(ciornaT.current); ciornaT.current = null;
    setCiornaSt(ciornaId.current ? 'Ciornă deschisă: se salvează singură cât scrii.' : 'Ce scrii se salvează singur în Ciorne (fără atașamente).');
    setSug(null);
    setScrie(true);
  }
  function deschideCiorna(c: any) {
    nou({ ciorna: c.id, raspunsLa: c.raspunsLa, tuturor: c.tuturor, de_la: c.de_la, catre: c.catre, cc: c.cc, subiect: c.subiect, text: c.text,
      redir: c.redirectioneazaPrimit ? { primit: c.redirectioneazaPrimit } : (c.redirectioneazaTrimis ? { trimis: c.redirectioneazaTrimis } : null) });
  }
  // „Răspunde": adresa, destinatarul, subiectul și mesajul citat le-a pus serverul (pentruRaspuns).
  function raspunde(d = deschis) {
    const p = d?.pentruRaspuns; if (!p) return;
    nou({ ...p, raspunsLa: d.id });
    setDeschis(null);
  }
  // „Răspunde tuturor": Cc-ul (toți din „Către" și „Cc", fără adresele noastre) îl alege serverul (pentruRaspunsTuturor).
  function raspundeTuturor() {
    const p = deschis?.pentruRaspunsTuturor; if (!p) return;
    nou({ ...p, raspunsLa: deschis.id, tuturor: true });
    setDeschis(null);
  }
  // „Redirecționează": un email primit (atașamentele lui merg și ele) sau unul trimis de noi (doar textul).
  function redirectioneaza(d = deschis) {
    const p = d?.pentruRedirectionare; if (!p) return;
    nou({ de_la: p.de_la, catre: '', subiect: p.subiect, text: p.text, redir: d.primit ? { primit: d.id } : { trimis: d.id },
      atasamenteRedir: p.atasamente || [], faraAtasamente: !!p.faraAtasamente });
    setDeschis(null);
  }
  // „Răspunde" / „Redirecționează" direct de pe rând: emailul se citește întâi (ce se pune în fereastră îl scrie serverul).
  async function rapidRaspunde(m: any) {
    try { const d = await Api.mailPrimit(m.id); raspunde({ ...d, primit: true }); incarcaMeta(); setLista((v) => (v || []).map((x) => (x._s === 'primit' && x.id === m.id ? { ...x, citit: true } : x))); }
    catch (e: any) { showToast(e?.message || 'Emailul nu se poate deschide.', true); }
  }
  async function rapidRedir(m: any) {
    try { const d = m._s === 'trimis' ? await Api.mailTrimis(m.id) : { ...(await Api.mailPrimit(m.id)), primit: true }; redirectioneaza(d); }
    catch (e: any) { showToast(e?.message || 'Emailul nu se poate deschide.', true); }
  }
  // Ciorna se salvează singură, la o clipă după ultima literă (Robert, 13.10: „3. a"). Fără atașamente.
  function setF(p: Partial<Form>) {
    setForm((f) => ({ ...f, ...p }));
    clearTimeout(ciornaT.current);
    ciornaT.current = setTimeout(() => { ciornaT.current = null; salveazaCiorna(); }, 1500);
  }
  async function salveazaCiorna() {
    const f = formRef.current;
    const corp: any = { id: ciornaId.current, de_la: f.de_la, catre: f.catre, cc: f.cc, subiect: f.subiect, text: f.text, tuturor: !!f.tuturor };
    if (f.raspunsLa) corp.raspunsLa = f.raspunsLa;
    else if (f.redir?.primit) corp.redirectioneazaPrimit = f.redir.primit;
    else if (f.redir?.trimis) corp.redirectioneazaTrimis = f.redir.trimis;
    try {
      const r = await Api.mailSalveazaCiorna(corp);
      if (r && r.id) { ciornaId.current = r.id; setCiornaSt('Ciornă salvată la ' + new Date().toLocaleTimeString('ro-RO', { hour: '2-digit', minute: '2-digit' })); }
    } catch (e: any) { setCiornaSt(e?.message || 'Ciorna nu s-a putut salva.'); }
  }
  async function inchideScrie() {
    if (busy) return;
    setScrie(false); setSug(null);
    if (ciornaT.current) { clearTimeout(ciornaT.current); ciornaT.current = null; await salveazaCiorna(); }   // ce era de salvat pleacă acum
    if (tab === 'ciorne') reload(); else incarcaMeta();
  }
  // Adresele sugerate sub „Către" / „Cc" (Robert: „3. b"): după ultima adresă scrisă (după virgulă); le alege serverul.
  function laAdresa(c: 'catre' | 'cc', v: string) {
    setF({ [c]: v } as any);
    clearTimeout(sugT.current);
    const tok = (v.split(/[,;]/).pop() || '').trim();
    if (tok.length < 2) { setSug(null); return; }
    sugT.current = setTimeout(async () => {
      try { const j = await Api.mailSugestii(tok); setSug((j.sugestii || []).length ? { camp: c, lista: j.sugestii } : null); }
      catch (e) { setSug(null); }
    }, 250);
  }
  function alegeSugestie(c: 'catre' | 'cc', adresa: string) {
    const parti = String(formRef.current[c] || '').split(/[,;]/); parti.pop();
    setF({ [c]: parti.map((x) => x.trim()).filter(Boolean).concat([adresa]).join(', ') + ', ' } as any);
    setSug(null);
  }
  async function trimite() {
    const fis = Array.from(fisRef.current?.files || []);
    const total = fis.reduce((s, f) => s + (f.size || 0), 0);
    const lim = meta?.limite?.atasamenteOcteti || 0;
    if (lim && total > lim) { showToast('Atașamentele trec de ' + oct(lim) + '.', true); return; }
    clearTimeout(ciornaT.current); ciornaT.current = null;   // nu se mai salvează ciorna a ceva care pleacă
    setBusy(true);
    try {
      const atasamente = await Promise.all(fis.map(citeste));
      const { raspunsLa, tuturor, redir, atasamenteRedir, faraAtasamente, ...rest } = form;
      const legat = raspunsLa ? { raspunsLa } : redir?.primit ? { redirectioneazaPrimit: redir.primit } : redir?.trimis ? { redirectioneazaTrimis: redir.trimis } : {};
      // După ce pleacă, ciorna se șterge (o face serverul).
      const cuCiorna = ciornaId.current ? { ciorna: ciornaId.current } : {};
      await Api.mailTrimite({ ...rest, atasamente, ...legat, ...cuCiorna });
      ciornaId.current = null;
      showToast(raspunsLa ? 'Răspunsul a plecat ✓' : redir ? 'Emailul a fost redirecționat ✓' : 'Emailul a plecat ✓');
      setScrie(false); reload();
    } catch (e: any) { showToast(e?.message || 'Emailul n-a plecat.', true); }
    finally { setBusy(false); }
  }
  async function necitit() {
    try { await Api.mailNecitit(deschis.id); setDeschis(null); reload(); }
    catch (e: any) { showToast(e?.message || 'Nu s-a putut marca.', true); }
  }
  async function atasament(a: any) {
    try { await salveazaDeLaServer('/api/mail/primite/' + deschis.id + '/atasamente/' + a.id, a.nume || 'atasament'); }
    catch (e: any) { showToast(e?.message || 'Atașamentul nu se poate descărca.', true); }
  }

  const sp = meta?.spatiu || {};
  const pct = sp.bazaOcteti && sp.capOcteti ? Math.min(100, Math.round(sp.bazaOcteti / sp.capOcteti * 100)) : null;
  const nec = (meta?.adrese || []).reduce((s: number, x: any) => s + (Number(x.necitite) || 0), 0);
  const dos = meta?.dosare || {};
  const nr: Record<Dosar, number> = { primite: nec, trimise: 0, ciorne: Number(dos.ciorne) || 0, spam: Number(dos.spam) || 0, cos: Number(dos.cos) || 0 };
  const zile = dos.zile;
  const ales: El[] = (lista || []).filter((m) => bifate[cheie(m)]).map((m) => ({ sursa: m._s, id: Number(m.id) }));
  const toate = !!(lista && lista.length && lista.every((m) => bifate[cheie(m)]));
  const cuImaginiDinAfara = !!(deschis?.primit && deschis.html && /<img[^>]+src\s*=\s*["']?\s*https?:/i.test(deschis.html));
  // Cadrul: doar imaginile (cele din afară, la cerere) și stilurile emailului; plus un font simplu pentru emailul care nu-și
  // alege unul (ar ieși cu Times) — ca pe web (_MAIL_CADRU_BAZA).
  const csp = (cuHttps: boolean) => '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src ' + (cuHttps ? 'https: ' : '') + 'data:; style-src \'unsafe-inline\'">'
    + '<style>body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;margin:12px}</style>';
  const B = (icon: any, titlu: string, fn: () => void, rosu?: boolean) => (
    <button aria-label={titlu} title={titlu} onClick={(e) => { e.stopPropagation(); fn(); }} style={ib + (rosu ? ';color:var(--red)' : '')}><Icon name={icon} size={16} /></button>
  );
  const eticheta2 = (t: string) => <span style="font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--bg-dark);color:var(--text-secondary)">{t}</span>;

  // Un rând din listă: bifa, steaua, ce e emailul, iar dedesubt butoanele lui.
  function rand(m: any) {
    const k = cheie(m), bif = !!bifate[k], el = el1(m);
    let titlu = m.subiect || '(fără subiect)', meta1 = '', semne: any[] = [], dreapta: any = cand(m.la), rapide: any[] = [], nou2 = false;
    if (m._s === 'ciorna') {
      meta1 = 'către ' + (m.catre || '—') + ' · de la ' + (m.de_la || '—');
      semne = [eticheta2(m.raspunsLa ? 'Răspuns' : (m.redirectioneazaPrimit || m.redirectioneazaTrimis) ? 'Redirecționare' : 'Ciornă')];
      rapide = [B('trash', 'Șterge ciorna', () => stergeCiorne([m.id]), true)];
    } else if (tab === 'cos') {
      meta1 = m._s === 'trimis' ? 'către ' + (m.catre || '—') + ' · de la ' + (m.de_la || '—') : 'de la ' + deLa(m) + ' · pe ' + (m.adresa || '');
      semne = [eticheta2(m.felText || ''), m.firma ? <span>{m.firma}</span> : null];
      dreapta = <>{cand(m.la)}{m.golitText ? <><br />{m.golitText}</> : null}</>;
      rapide = [B('undo', 'Recuperează', () => actiune('recupereaza', el)), B('trash', 'Șterge definitiv', () => actiune('definitiv', el), true)];
    } else if (m._s === 'trimis') {
      meta1 = 'către ' + m.catre + (m.cc ? ' · cc ' + m.cc : '') + ' · de la ' + m.de_la;
      semne = [eticheta2(m.felText), m.firma ? <span>{m.firma}</span> : null, <span>{m.cine}</span>, (m.atasamente || []).length ? <span>📎 {m.atasamente.length}</span> : null,
        <span style={'margin-left:auto;font-weight:700;color:' + (m.stare === 'esuat' ? 'var(--red)' : 'var(--accent)')}>{m.stare === 'esuat' ? 'n-a plecat' : 'trimis'}</span>];
      rapide = [B('forward', 'Redirecționează', () => rapidRedir(m))];
      if (m.sePoateSterge) rapide.push(B('trash', 'Șterge', () => actiune('sterge', el), true));
    } else {
      nou2 = !m.citit;
      meta1 = 'de la ' + deLa(m) + ((meta?.adrese || []).length > 1 ? ' · pe ' + m.catre : '');
      semne = [m.firma ? eticheta2(m.firma) : null, m.raspuns ? <span style="color:var(--accent)">↩ {m.raspuns.text}</span> : null,
        (m.atasamente || []).length ? <span>📎 {m.atasamente.length}</span> : null,
        m.verificare === 'picat' ? <span style="color:var(--red);font-weight:700">⚠ expeditor nedovedit</span> : null,
        !m.citit ? <span style="margin-left:auto;font-weight:800;color:var(--accent)">nou</span> : null];
      rapide = tab === 'spam'
        ? [B('inbox', 'Nu e spam', () => actiune('nuspam', el)), B('trash', 'Șterge', () => actiune('sterge', el), true)]
        : [B('reply', 'Răspunde', () => rapidRaspunde(m)), B('forward', 'Redirecționează', () => rapidRedir(m)),
          m.citit ? B('mail', 'Marchează necitit', () => actiune('necitit', el)) : B('mailOpen', 'Marchează citit', () => actiune('citit', el)),
          B('ban', 'Spam', () => actiune('spam', el)), B('trash', 'Șterge', () => actiune('sterge', el), true)];
    }
    return (
      <div onClick={() => deschide(m)} style={'background:var(--bg-panel);border:1px solid ' + (bif ? 'var(--accent)' : 'var(--border)') + ';border-radius:12px;padding:11px 13px;margin-bottom:8px;cursor:pointer'
        + (nou2 ? ';border-left:3px solid var(--accent)' : '')}>
        <div style="display:flex;gap:9px;align-items:flex-start">
          <input type="checkbox" checked={bif} aria-label="Selectează" onClick={(e) => e.stopPropagation()}
            onChange={(e) => { const v = (e.target as HTMLInputElement).checked; setBifate((b) => { const n = { ...b }; if (v) n[k] = true; else delete n[k]; return n; }); }}
            style="width:19px;height:19px;margin:1px 0 0;accent-color:var(--accent);flex:0 0 auto" />
          {m._s !== 'ciorna' && (
            <button aria-label={m.stea ? 'Scoate steaua' : 'Pune stea'} title={m.stea ? 'Scoate steaua' : 'Pune stea'}
              onClick={(e) => { e.stopPropagation(); actiune(m.stea ? 'farastea' : 'stea', el); }}
              style={'background:none;border:0;padding:0;margin-top:1px;cursor:pointer;flex:0 0 auto;color:' + (m.stea ? STEA : 'var(--text-muted)')}>
              <Icon name={m.stea ? 'starFill' : 'star'} size={18} />
            </button>
          )}
          <div style="flex:1;min-width:0">
            <div style="display:flex;gap:8px;align-items:flex-start">
              <span style={'font-size:13.5px;flex:1;min-width:0;overflow-wrap:anywhere;font-weight:' + (nou2 ? '800' : (m._s === 'primit' ? '600' : '700'))}>{titlu}</span>
              <span style="font-size:11px;color:var(--text-muted);white-space:nowrap;text-align:right">{dreapta}</span>
            </div>
            <div style="font-size:11.5px;color:var(--text-muted);margin-top:3px;overflow-wrap:anywhere">{meta1}</div>
            {semne.some(Boolean) && <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">{semne}</div>}
          </div>
        </div>
        <div style="display:flex;gap:6px;justify-content:flex-end;margin-top:8px" onClick={(e) => e.stopPropagation()}>{rapide}</div>
      </div>
    );
  }
  // Acțiunile dosarului deschis, pentru cele bifate.
  const bulk: [string, string][] = tab === 'primite' ? [['citit', 'Citit'], ['necitit', 'Necitit'], ['stea', 'Stea'], ['spam', 'Spam'], ['sterge', 'Șterge']]
    : tab === 'spam' ? [['nuspam', 'Nu e spam'], ['sterge', 'Șterge']]
    : tab === 'trimise' ? [['stea', 'Stea'], ['sterge', 'Șterge']]
    : tab === 'cos' ? [['recupereaza', 'Recuperează'], ['definitiv', 'Șterge definitiv']]
    : [['ciorne', 'Șterge']];
  const notaDosar = tab === 'spam' ? 'Aici ajung singure emailurile expeditorilor pe care i-ați marcat ca spam' + (zile ? '; se șterg singure după ' + zile + ' de zile' : '') + '. „Nu e spam" le mută înapoi în Primite.'
    : tab === 'cos' ? 'Emailurile șterse stau aici' + (zile ? ' ' + zile + ' de zile, apoi se șterg singure' : '') + '. „Recuperează" le pune înapoi de unde au venit.'
    : tab === 'ciorne' ? 'Ciornele se salvează singure cât scrii (fără atașamente) și sunt doar ale tale.' : '';
  const cuCautare = tab === 'primite' || tab === 'trimise' || tab === 'spam';
  // Butoanele care țin de dosar, în fereastra unui email deschis (ca _mailActeDeschis pe web).
  function acteDeschis(d: any) {
    const el: El[] = [{ sursa: d.primit ? 'primit' : 'trimis', id: Number(d.id) }];
    const out = [<button class="btn" onClick={() => actiune(d.stea ? 'farastea' : 'stea', el)} style={'flex:1;' + btnAlt}>{d.stea ? 'Scoate steaua' : 'Stea'}</button>];
    if (d.dosar === 'cos') return out.concat([
      <button class="btn" onClick={() => actiune('recupereaza', el)} style={'flex:1;' + btnAlt}>Recuperează</button>,
      <button class="btn" onClick={() => actiune('definitiv', el)} style={'flex:1;' + btnAlt + ';color:var(--red)'}>Șterge definitiv</button>]);
    if (d.primit) out.push(d.dosar === 'spam'
      ? <button class="btn" onClick={() => actiune('nuspam', el)} style={'flex:1;' + btnAlt}>Nu e spam</button>
      : <button class="btn" onClick={() => actiune('spam', el)} style={'flex:1;' + btnAlt}>Spam</button>);
    return out;
  }
  const sugBox = (c: 'catre' | 'cc') => (sug && sug.camp === c ? (
    <div style="border:1px solid var(--border);border-radius:10px;background:var(--bg-panel);margin-top:4px;overflow:hidden">
      {sug.lista.map((x: any) => (
        <button onClick={() => alegeSugestie(c, x.adresa)} style="display:block;width:100%;text-align:left;padding:9px 12px;background:none;border:0;border-bottom:1px solid var(--border);color:var(--text-primary);font:inherit;font-size:13.5px;cursor:pointer">
          <b>{x.nume || x.adresa}</b>{x.nume ? <span style="display:block;font-size:12px;color:var(--text-secondary)">{x.adresa}</span> : null}
          <span style="display:block;font-size:11px;color:var(--text-secondary)">{x.sursa || ''}</span>
        </button>
      ))}
    </div>) : null);

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Mail</div>
        <button class="h-btn" onClick={reload} aria-label="Reîncarcă"><Icon name="refresh" size={20} /></button>
      </header>
      <div class="content has-tabbar" style="padding:12px 14px 24px">
        {!isSuper && <div class="adm-empty" style="color:var(--red)">Panoul de mail e doar al fondatorilor.</div>}
        {isSuper && (
          <>
            {meta && (
              <>
                {/* Indicatorul de încărcare: cât ocupă mailul și cât ocupă toată baza din discul ei (portocaliu de la 70%). */}
                <div style="background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:10px 13px;margin-bottom:10px;font-size:12.5px;color:var(--text-secondary)">
                  Mailul ocupă <b>{oct(sp.mailOcteti)}</b> ({numar(sp.numar)})
                  {pct != null && <> · toată baza: <b>{oct(sp.bazaOcteti)}</b> din {oct(sp.capOcteti)} ({pct}%)</>}
                  {pct != null && (
                    <div style="height:6px;border-radius:4px;background:var(--bg-dark);overflow:hidden;margin-top:7px">
                      <i style={'display:block;height:100%;width:' + pct + '%;background:' + (pct >= 70 ? '#d97706' : 'var(--accent)')} />
                    </div>
                  )}
                </div>
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">
                  {meta.activ
                    ? <>Emailul pleacă prin {meta.cale === 'brevo' ? 'Brevo' : 'SMTP'}.</>
                    : <span style="color:var(--red)">Serverul n-are email configurat: nu pleacă nimic până nu se pune cheia Brevo în Railway.</span>}
                </div>
                {tab === 'primite' && (
                  <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px">
                    {meta.primire
                      ? <>Emailurile primite pe adresele de mai jos ajung aici.</>
                      : <span style="color:var(--red)">Primirea nu e pornită încă: emailurile nu ajung aici până nu se leagă Cloudflare (parola de primire în Railway și în Cloudflare).</span>}
                  </div>
                )}
                <div role="tablist" style="display:flex;overflow-x:auto;scrollbar-width:none;border-bottom:1px solid var(--border);margin:6px 0 10px">
                  {DOSARE.map(([k, t]) => (
                    <button role="tab" aria-selected={tab === k} onClick={() => schimbaFila(k)} style={fila(tab === k)}>
                      {t}{nr[k] ? <span style={bulina(k !== 'primite')}>{nr[k]}</span> : null}
                    </button>
                  ))}
                </div>
                {notaDosar && <div style={nota}>{notaDosar}</div>}
                {tab !== 'ciorne' && (
                  <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                    <button onClick={() => setFiltru('')} style={chip(!filtru)}>Toate</button>
                    {(meta.adrese || []).map((a: any) => (
                      <button onClick={() => setFiltru(a.adresa)} style={chip(filtru === a.adresa)}>
                        {(a.comuna ? a.adresa : a.adresa + ' (a mea)') + (tab === 'primite' && a.necitite ? ' · ' + a.necitite : '')}
                      </button>
                    ))}
                    {(tab === 'primite' || tab === 'trimise') && (
                      <button onClick={() => setStea(!stea)} style={chip(stea)}><Icon name={stea ? 'starFill' : 'star'} size={14} /> Cu stea</button>
                    )}
                  </div>
                )}
                <div style="display:flex;gap:8px;margin-bottom:12px">
                  {cuCautare
                    ? <input type="search" value={cauta} onInput={(e) => laCautare((e.target as HTMLInputElement).value)}
                        placeholder={tab === 'trimise' ? 'Caută după destinatar sau subiect…' : 'Caută după expeditor sau subiect…'} style={camp + ';flex:1;font-size:14px'} />
                    : <span style="flex:1" />}
                  <button class="btn btn-primary" disabled={!meta.activ} onClick={() => nou()} style="white-space:nowrap"><Icon name="edit" size={16} /> Scrie</button>
                </div>
              </>
            )}
            {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
            {lista == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
            {lista && lista.length === 0 && !err && <div class="adm-empty"><Icon name="mail" size={40} class="ic" /><div>{cauta ? 'Nimic găsit.' : GOL[tab]}</div></div>}
            {lista && lista.length > 0 && (
              <div class="adm-list">
                {/* Bara de deasupra listei: „Selectează tot", iar cu ceva bifat — câte și acțiunile dosarului. Stă mereu pe loc și
                    rămâne lipită sus cât derulezi (ca prima bifă să nu împingă lista). */}
                <div style={'position:sticky;top:0;z-index:2;display:flex;gap:6px;flex-wrap:wrap;align-items:center;min-height:48px;box-sizing:border-box;padding:7px 10px 7px 13px;margin-bottom:8px;border-radius:12px;background:var(--bg-panel);font-size:13px;color:var(--text-primary);border:1px solid ' + (ales.length ? 'var(--accent)' : 'var(--border)')}>
                  <label style="display:inline-flex;align-items:center;gap:8px;font-size:12.5px;color:var(--text-secondary);margin-right:4px">
                    <input type="checkbox" checked={toate} style="width:19px;height:19px;accent-color:var(--accent)"
                      onChange={(e) => { const v = (e.target as HTMLInputElement).checked; const n: Record<string, boolean> = {}; if (v) (lista || []).forEach((m) => { n[cheie(m)] = true; }); setBifate(n); }} />
                    {ales.length ? <span><b style="color:var(--text-primary)">{ales.length}</b> {ales.length === 1 ? 'selectat' : 'selectate'}</span> : 'Selectează tot'}
                  </label>
                  {ales.length > 0 && bulk.map(([a, t]) => (
                    <button class="btn" onClick={() => (a === 'ciorne' ? stergeCiorne(ales.map((x) => x.id)) : actiune(a, ales))}
                      style={btnAlt + ';font-size:12.5px;padding:6px 10px' + (a === 'sterge' || a === 'definitiv' || a === 'ciorne' ? ';color:var(--red)' : '')}>{t}</button>
                  ))}
                  {ales.length > 0 && <button class="btn" onClick={() => setBifate({})} style={btnAlt + ';font-size:12.5px;padding:6px 10px'}>Renunță</button>}
                </div>
                {lista.map(rand)}
                {maiSunt && <button class="btn" onClick={() => incarcaLista(pagina + 1, true)} style={'width:100%;' + btnAlt}>Mai multe</button>}
              </div>
            )}
          </>
        )}
      </div>

      {deschis && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) setDeschis(null); }}>
          <div class="sheet" style="max-height:92vh">
            <div class="sheet-h"><b style="overflow-wrap:anywhere"><Icon name="mail" size={18} color="var(--accent)" /> {deschis.incarca ? 'Email' : (deschis.subiect || '(fără subiect)')}</b>
              <button class="h-btn" onClick={() => setDeschis(null)} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              {deschis.incarca ? <div class="spin" style="margin:20px auto" /> : deschis.primit ? (
                <>
                  {deschis.avertisment && <div style={aviz(true)}>⚠ {deschis.avertisment}</div>}
                  {deschis.neintreg && <div style={aviz(false)}>{deschis.neintreg}</div>}
                  <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7;margin-bottom:10px;overflow-wrap:anywhere">
                    <b>De la:</b> {deLa(deschis)}{deschis.raspuns_catre ? ' · răspunsul merge la ' + deschis.raspuns_catre : ''}
                    <br /><b>Către:</b> {deschis.antet_catre || deschis.catre}
                    {deschis.antet_cc ? <><br /><b>Cc:</b> {deschis.antet_cc}</> : null}
                    <br /><b>Primit:</b> {cand(deschis.la)}{deschis.firma ? ' · ' + deschis.firma : ''}
                    {deschis.raspuns ? <><br /><span style="color:var(--accent)">↩ {deschis.raspuns.text}</span></> : null}
                  </div>
                  {(deschis.atasamente || []).length > 0 && (
                    <div style="display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px">
                      {deschis.atasamente.map((a: any) => a.pastrat
                        ? <button class="btn" onClick={() => atasament(a)} style={btnAlt + ';font-size:12.5px;padding:7px 10px'}>📎 {a.nume} ({oct(a.octeti)})</button>
                        : <span style="font-size:12.5px;padding:7px 10px;border-radius:9px;border:1px solid var(--border);opacity:.65">📎 {a.nume} — doar numele</span>)}
                    </div>
                  )}
                  {cuImaginiDinAfara && !imagini && (
                    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:8px;display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                      Imaginile din afară sunt oprite. <button class="btn" onClick={() => setImagini(true)} style={btnAlt + ';font-size:12.5px;padding:6px 10px'}>Arată imaginile</button>
                    </div>
                  )}
                  {/* HTML-ul emailului stă într-un cadru izolat: fără scripturi, fără linkuri, fără acces la aplicație.
                      Imaginile din afară, doar la „Arată imaginile" (altfel expeditorul ar afla când l-ai deschis). */}
                  {deschis.html
                    ? <iframe sandbox="" referrerpolicy="no-referrer" title="Conținutul emailului" style="width:100%;min-height:380px;border:1px solid var(--border);border-radius:10px;background:#fff"
                        srcdoc={csp(imagini) + '<meta name="referrer" content="no-referrer">' + deschis.html} />
                    : <div style="white-space:pre-wrap;font-size:14px;line-height:1.55;overflow-wrap:anywhere">{deschis.text || ''}</div>}
                  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
                    {deschis.dosar !== 'cos' && <button class="btn btn-primary" disabled={!meta?.activ} onClick={() => raspunde()} style="flex:1 1 100%"><Icon name="reply" size={16} /> Răspunde</button>}
                    {deschis.dosar !== 'cos' && deschis.pentruRaspunsTuturor?.cc ? <button class="btn" disabled={!meta?.activ} onClick={raspundeTuturor} style={'flex:1;' + btnAlt}>Răspunde tuturor</button> : null}
                    {deschis.dosar !== 'cos' && <button class="btn" disabled={!meta?.activ} onClick={() => redirectioneaza()} style={'flex:1;' + btnAlt}>Redirecționează</button>}
                    <button class="btn" onClick={necitit} style={'flex:1;' + btnAlt}>Marchează necitit</button>
                    {acteDeschis(deschis)}
                    {deschis.dosar !== 'cos' && <button class="btn" onClick={() => actiune('sterge', [{ sursa: 'primit', id: Number(deschis.id) }])} style={'flex:1;' + btnAlt + ';color:var(--red)'}>Șterge</button>}
                  </div>
                </>
              ) : (
                <>
                  <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7;margin-bottom:10px;overflow-wrap:anywhere">
                    <b>De la:</b> {deschis.de_la}<br /><b>Către:</b> {deschis.catre}{deschis.cc ? <><br /><b>Cc:</b> {deschis.cc}</> : null}<br /><b>Când:</b> {cand(deschis.la)} · {deschis.felText}
                    {deschis.firma ? ' · ' + deschis.firma : ''} · {deschis.cine}
                    {deschis.stare === 'esuat' && <><br /><span style="color:var(--red)"><b>N-a plecat:</b> {deschis.eroare}</span></>}
                    {(deschis.atasamente || []).length ? <><br /><b>Atașamente:</b> {deschis.atasamente.map((x: any) => x.nume + (x.octeti ? ' (' + oct(x.octeti) + ')' : '')).join(', ')}</> : null}
                  </div>
                  {/* HTML-ul emailului stă într-un cadru izolat: fără scripturi, fără acces la aplicație. */}
                  {deschis.html
                    ? <iframe sandbox="" referrerpolicy="no-referrer" title="Conținutul emailului" style="width:100%;min-height:380px;border:1px solid var(--border);border-radius:10px;background:#fff"
                        srcdoc={csp(true) + deschis.html} />
                    : <div style="white-space:pre-wrap;font-size:14px;line-height:1.55;overflow-wrap:anywhere">{deschis.text || ''}</div>}
                  <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
                    {deschis.dosar !== 'cos' && <button class="btn btn-primary" disabled={!meta?.activ} onClick={() => redirectioneaza()} style="flex:1 1 100%"><Icon name="forward" size={16} /> Redirecționează</button>}
                    {acteDeschis(deschis)}
                    {deschis.dosar !== 'cos' && deschis.sePoateSterge ? <button class="btn" onClick={() => actiune('sterge', [{ sursa: 'trimis', id: Number(deschis.id) }])} style={'flex:1;' + btnAlt + ';color:var(--red)'}>Șterge</button> : null}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {scrie && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) inchideScrie(); }}>
          <div class="sheet" style="max-height:94vh">
            <div class="sheet-h"><b><Icon name="edit" size={18} color="var(--accent)" /> {form.raspunsLa ? (form.tuturor ? 'Răspuns tuturor' : 'Răspuns') : (form.redir ? 'Redirecționare' : 'Email nou')}</b>
              <button class="h-btn" onClick={inchideScrie} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              <label style={eticheta}>De la</label>
              {/* Răspunsul pleacă de pe adresa pe care a venit emailul (așa cere și serverul). */}
              <select value={form.de_la} disabled={!!form.raspunsLa} onChange={(e) => setF({ de_la: (e.target as HTMLSelectElement).value })} style={camp}>
                {(meta?.adrese || []).filter((a: any) => !form.raspunsLa || a.adresa === form.de_la).map((a: any) => <option value={a.adresa}>{a.nume + ' <' + a.adresa + '>'}</option>)}
              </select>
              <label style={eticheta}>Către</label>
              <input type="text" inputMode="email" autocapitalize="off" autocomplete="off" spellcheck={false} value={form.catre}
                onInput={(e) => laAdresa('catre', (e.target as HTMLInputElement).value)}
                placeholder="adresa@firma.ro — mai multe, despărțite prin virgulă" style={camp} />
              {sugBox('catre')}
              <label style={eticheta}>Cc</label>
              <input type="text" inputMode="email" autocapitalize="off" autocomplete="off" spellcheck={false} value={form.cc}
                onInput={(e) => laAdresa('cc', (e.target as HTMLInputElement).value)}
                placeholder="opțional — mai multe, despărțite prin virgulă" style={camp} />
              {sugBox('cc')}
              <label style={eticheta}>Subiect</label>
              <input type="text" maxLength={200} value={form.subiect} onInput={(e) => setF({ subiect: (e.target as HTMLInputElement).value })} style={camp} />
              <label style={eticheta}>Mesaj</label>
              <textarea value={form.text} onInput={(e) => setF({ text: (e.target as HTMLTextAreaElement).value })} style={camp + ';min-height:170px;resize:vertical;line-height:1.5'} />
              {/* Semnătura adresei alese o scrie serverul (din fișa omului); aici doar se arată. */}
              {(() => { const a = (meta?.adrese || []).find((x: any) => x.adresa === form.de_la) || {}; return (
                <div style="font-size:12px;line-height:1.5;color:var(--text-secondary);margin-top:6px;overflow-wrap:anywhere">
                  Semnătura se adaugă singură: <b style="color:var(--text-primary)">{a.semnatura || ''}</b>
                  {(a.faraTelefon || a.faraFunctie) ? <><br />{(a.faraFunctie && a.faraTelefon ? 'Funcția și telefonul se iau' : a.faraFunctie ? 'Funcția se ia' : 'Telefonul se ia')
                    + ' din fișa ta (Gestiune → Utilizatori → rândul tău) sau din Setări → Contul meu.'}</> : null}
                </div>); })()}
              {(form.atasamenteRedir || []).length > 0 && (
                <div style="font-size:12px;line-height:1.5;color:var(--text-secondary);margin-top:6px;overflow-wrap:anywhere">
                  📎 Merg mai departe și atașamentele emailului: {(form.atasamenteRedir || []).map((x: any) => x.nume + ' (' + oct(x.octeti) + ')').join(', ')}
                </div>)}
              {form.faraAtasamente && (
                <div style="font-size:12px;line-height:1.5;color:var(--text-secondary);margin-top:6px">Atașamentele emailurilor trimise nu se păstrează la noi: se redirecționează doar textul.</div>)}
              <label style={eticheta}>Atașamente (cel mult {oct(meta?.limite?.atasamenteOcteti)} în total)</label>
              <input ref={fisRef} type="file" multiple style="font-size:13px;color:var(--text-secondary)" />
              <div style="font-size:12px;color:var(--text-secondary);margin-top:10px">💾 {ciornaSt}</div>
              <button class="btn btn-primary" disabled={busy} onClick={trimite} style="width:100%;margin-top:14px">{busy ? 'Se trimite…' : 'Trimite'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
