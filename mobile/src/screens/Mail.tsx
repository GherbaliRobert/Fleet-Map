import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { salveazaDeLaServer } from '../lib/export';
import './detail.css';
import './admin.css';

// Panoul Mail (Robert, 12.10: „noi adminii să avem un panou de mail" — „și pe telefon, bineînțeles"), ca pe web
// (Administrare → Mail): etapa 1 „Trimise" + „Scrie", etapa 2 „Primite" + „Răspunde". Telefonul NU hotărăște nimic: ce
// adrese vezi (adresa comună + a ta), câte sunt necitite, starea fiecărui email, spațiul ocupat, felul emailului,
// avertismentele și ce se pune în răspuns (subiectul „Re:", mesajul citat) le dă serverul. Aceleași cuvinte ca pe web.
// Pe telefon, linkurile din emailurile primite rămân oprite (cadrul gol, sandbox=""): o filă nouă deschisă din cadru
// n-are unde să meargă în aplicație și ar putea scoate omul din ea.

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
const chip = (on: boolean) => 'padding:7px 12px;border-radius:9px;font-size:12.5px;font-weight:700;font-family:inherit;border:1px solid var(--border);cursor:pointer;'
  + (on ? 'background:var(--accent);color:#06210F' : 'background:var(--bg-dark);color:var(--text-primary)');
const fila = (on: boolean) => 'flex:1;padding:10px 8px;font:inherit;font-size:14px;font-weight:700;background:none;border:0;cursor:pointer;border-bottom:2px solid '
  + (on ? 'var(--accent);color:var(--text-primary)' : 'transparent;color:var(--text-secondary)');
const bulina = 'display:inline-block;min-width:18px;text-align:center;padding:1px 6px;border-radius:999px;background:var(--accent);color:#06210F;font-size:11px;font-weight:800;margin-left:6px';
const camp = 'width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-dark);color:var(--text-primary);font:inherit;font-size:15px';
const eticheta = 'display:block;font-size:12px;font-weight:700;color:var(--text-secondary);margin:12px 0 5px';
const aviz = (rosu: boolean) => 'border-radius:10px;padding:9px 12px;font-size:12.5px;line-height:1.45;margin-bottom:10px;border:1px solid '
  + (rosu ? 'rgba(239,68,68,.45);background:rgba(239,68,68,.10);color:var(--text-primary)' : 'rgba(245,158,11,.45);background:rgba(245,158,11,.10);color:var(--text-primary)');
const btnAlt = 'background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)';

export function Mail() {
  const loc = useLocation();
  const isSuper = !!me.value?.isSuper;
  const [tab, setTab] = useState<'primite' | 'trimise'>('primite');
  const [meta, setMeta] = useState<any | null>(null);
  const [lista, setLista] = useState<any[] | null>(null);
  const [maiSunt, setMaiSunt] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [filtru, setFiltru] = useState('');
  const [cauta, setCauta] = useState('');
  const [err, setErr] = useState('');
  const [deschis, setDeschis] = useState<any | null>(null);
  const [imagini, setImagini] = useState(false);
  const [scrie, setScrie] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<{ de_la: string; catre: string; subiect: string; text: string; raspunsLa: number | null }>({ de_la: '', catre: '', subiect: '', text: '', raspunsLa: null });
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
  async function incarcaLista(p: number, adauga: boolean, f = filtru, q = cauta, t = tab) {
    const s = ++seq.current;
    try {
      const q2 = { adresa: f || undefined, cauta: q || undefined, pagina: p };
      const j = t === 'primite' ? await Api.mailPrimite(q2) : await Api.mailTrimise(q2);
      if (s !== seq.current) return;   // între timp s-a schimbat fila sau căutarea
      setLista((v) => (adauga && v ? v.concat(j.mailuri || []) : (j.mailuri || [])));
      setMaiSunt(!!j.maiSunt); setPagina(p);
    } catch (e: any) { if (s === seq.current) { setErr(e?.message || 'Nu s-a putut încărca lista.'); setLista([]); } }
  }
  function reload() { setErr(''); setLista(null); incarcaMeta(); incarcaLista(0, false); }
  useEffect(() => { if (isSuper) reload(); }, []);
  useEffect(() => { if (isSuper && meta) { setLista(null); incarcaLista(0, false); } }, [filtru, tab]);

  function schimbaFila(t: 'primite' | 'trimise') { if (t === tab) return; setCauta(''); setTab(t); }
  function laCautare(v: string) {
    setCauta(v);
    clearTimeout(cautaT.current);
    cautaT.current = setTimeout(() => incarcaLista(0, false, filtru, v.trim()), 350);
  }
  async function deschide(id: number) {
    setImagini(false);
    setDeschis({ incarca: true });
    try {
      if (tab === 'primite') {
        const m = await Api.mailPrimit(id);
        setDeschis({ ...m, primit: true });
        // Deschis = citit (l-a trecut serverul): rândul și bulinele se schimbă pe loc.
        setLista((v) => (v || []).map((x) => (x.id === id ? { ...x, citit: true } : x)));
        incarcaMeta();
      } else setDeschis(await Api.mailTrimis(id));
    } catch (e: any) { setDeschis(null); showToast(e?.message || 'Emailul nu se poate deschide.', true); }
  }
  function nou(pre?: any) {
    if (!meta?.activ) { showToast('Serverul n-are email configurat.', true); return; }
    const adr = meta.adrese || [];
    const aMea = adr.find((x: any) => x.aMea);
    if (pre) setForm({ de_la: pre.de_la, catre: pre.catre || '', subiect: pre.subiect || '', text: pre.text || '', raspunsLa: pre.raspunsLa });
    else setForm({ de_la: (aMea || adr.find((x: any) => x.comuna) || adr[0] || {}).adresa || '', catre: '', subiect: '', text: '', raspunsLa: null });
    setScrie(true);
  }
  // „Răspunde": adresa, destinatarul, subiectul și mesajul citat le-a pus serverul (pentruRaspuns).
  function raspunde() {
    const p = deschis?.pentruRaspuns; if (!p) return;
    nou({ ...p, raspunsLa: deschis.id });
    setDeschis(null);
  }
  async function trimite() {
    const fis = Array.from(fisRef.current?.files || []);
    const total = fis.reduce((s, f) => s + (f.size || 0), 0);
    const lim = meta?.limite?.atasamenteOcteti || 0;
    if (lim && total > lim) { showToast('Atașamentele trec de ' + oct(lim) + '.', true); return; }
    setBusy(true);
    try {
      const atasamente = await Promise.all(fis.map(citeste));
      const { raspunsLa, ...rest } = form;
      await Api.mailTrimite(raspunsLa ? { ...rest, atasamente, raspunsLa } : { ...rest, atasamente });
      showToast(raspunsLa ? 'Răspunsul a plecat ✓' : 'Emailul a plecat ✓');
      setScrie(false); reload();
    } catch (e: any) { showToast(e?.message || 'Emailul n-a plecat.', true); }
    finally { setBusy(false); }
  }
  async function necitit() {
    try { await Api.mailNecitit(deschis.id); setDeschis(null); reload(); }
    catch (e: any) { showToast(e?.message || 'Nu s-a putut marca.', true); }
  }
  async function sterge() {
    if (!confirm('Ștergi emailul, cu atașamentele lui? Nu se mai poate recupera.')) return;
    try { await Api.mailStergePrimit(deschis.id); showToast('Emailul a fost șters.'); setDeschis(null); reload(); }
    catch (e: any) { showToast(e?.message || 'Nu s-a putut șterge.', true); }
  }
  async function atasament(a: any) {
    try { await salveazaDeLaServer('/api/mail/primite/' + deschis.id + '/atasamente/' + a.id, a.nume || 'atasament'); }
    catch (e: any) { showToast(e?.message || 'Atașamentul nu se poate descărca.', true); }
  }

  const sp = meta?.spatiu || {};
  const pct = sp.bazaOcteti && sp.capOcteti ? Math.min(100, Math.round(sp.bazaOcteti / sp.capOcteti * 100)) : null;
  const nec = (meta?.adrese || []).reduce((s: number, x: any) => s + (Number(x.necitite) || 0), 0);
  const cuImaginiDinAfara = !!(deschis?.primit && deschis.html && /<img[^>]+src\s*=\s*["']?\s*https?:/i.test(deschis.html));
  // Cadrul: doar imaginile (cele din afară, la cerere) și stilurile emailului; plus un font simplu pentru emailul care nu-și
  // alege unul (ar ieși cu Times) — ca pe web (_MAIL_CADRU_BAZA).
  const csp = (cuHttps: boolean) => '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src ' + (cuHttps ? 'https: ' : '') + 'data:; style-src \'unsafe-inline\'">'
    + '<style>body{font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif;font-size:14px;line-height:1.5;color:#1f2937;margin:12px}</style>';

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
                <div role="tablist" style="display:flex;border-bottom:1px solid var(--border);margin:6px 0 10px">
                  <button role="tab" aria-selected={tab === 'primite'} onClick={() => schimbaFila('primite')} style={fila(tab === 'primite')}>
                    Primite{nec ? <span style={bulina}>{nec}</span> : null}
                  </button>
                  <button role="tab" aria-selected={tab === 'trimise'} onClick={() => schimbaFila('trimise')} style={fila(tab === 'trimise')}>Trimise</button>
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                  <button onClick={() => setFiltru('')} style={chip(!filtru)}>Toate</button>
                  {(meta.adrese || []).map((a: any) => (
                    <button onClick={() => setFiltru(a.adresa)} style={chip(filtru === a.adresa)}>
                      {(a.comuna ? a.adresa : a.adresa + ' (a mea)') + (tab === 'primite' && a.necitite ? ' · ' + a.necitite : '')}
                    </button>
                  ))}
                </div>
                <div style="display:flex;gap:8px;margin-bottom:12px">
                  <input type="search" value={cauta} onInput={(e) => laCautare((e.target as HTMLInputElement).value)}
                    placeholder={tab === 'primite' ? 'Caută după expeditor sau subiect…' : 'Caută după destinatar sau subiect…'} style={camp + ';flex:1;font-size:14px'} />
                  <button class="btn btn-primary" disabled={!meta.activ} onClick={() => nou()} style="white-space:nowrap"><Icon name="edit" size={16} /> Scrie</button>
                </div>
              </>
            )}
            {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
            {lista == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
            {lista && lista.length === 0 && !err && <div class="adm-empty"><Icon name="mail" size={40} class="ic" /><div>{cauta ? 'Nimic găsit.' : (tab === 'primite' ? 'Niciun email primit încă.' : 'Niciun email trimis încă.')}</div></div>}
            {lista && lista.length > 0 && tab === 'primite' && (
              <div class="adm-list">
                {lista.map((m) => (
                  <div onClick={() => deschide(m.id)} style={'background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:11px 13px;margin-bottom:8px;cursor:pointer'
                    + (m.citit ? '' : ';border-left:3px solid var(--accent)')}>
                    <div style="display:flex;gap:8px;align-items:flex-start">
                      <span style={'font-size:13.5px;flex:1;min-width:0;overflow-wrap:anywhere;font-weight:' + (m.citit ? '600' : '800')}>{m.subiect || '(fără subiect)'}</span>
                      <span style="font-size:11px;color:var(--text-muted);white-space:nowrap">{cand(m.la)}</span>
                    </div>
                    <div style="font-size:11.5px;color:var(--text-muted);margin-top:3px;overflow-wrap:anywhere">de la {deLa(m)}{(meta?.adrese || []).length > 1 ? ' · pe ' + m.catre : ''}</div>
                    <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                      {m.firma ? <span style="font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--bg-dark);color:var(--text-secondary)">{m.firma}</span> : null}
                      {m.raspuns ? <span style="color:var(--accent)">↩ {m.raspuns.text}</span> : null}
                      {(m.atasamente || []).length ? <span>📎 {m.atasamente.length}</span> : null}
                      {m.verificare === 'picat' ? <span style="color:var(--red);font-weight:700">⚠ expeditor nedovedit</span> : null}
                      {!m.citit ? <span style="margin-left:auto;font-weight:800;color:var(--accent)">nou</span> : null}
                    </div>
                  </div>
                ))}
                {maiSunt && <button class="btn" onClick={() => incarcaLista(pagina + 1, true)} style={'width:100%;' + btnAlt}>Mai multe</button>}
              </div>
            )}
            {lista && lista.length > 0 && tab === 'trimise' && (
              <div class="adm-list">
                {lista.map((m) => (
                  <div onClick={() => deschide(m.id)} style="background:var(--bg-panel);border:1px solid var(--border);border-radius:12px;padding:11px 13px;margin-bottom:8px;cursor:pointer">
                    <div style="display:flex;gap:8px;align-items:flex-start">
                      <b style="font-size:13.5px;flex:1;min-width:0;overflow-wrap:anywhere">{m.subiect || '(fără subiect)'}</b>
                      <span style="font-size:11px;color:var(--text-muted);white-space:nowrap">{cand(m.la)}</span>
                    </div>
                    <div style="font-size:11.5px;color:var(--text-muted);margin-top:3px;overflow-wrap:anywhere">către {m.catre} · de la {m.de_la}</div>
                    <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px;display:flex;gap:6px;flex-wrap:wrap;align-items:center">
                      <span style="font-size:10.5px;font-weight:700;padding:2px 8px;border-radius:999px;background:var(--bg-dark);color:var(--text-secondary)">{m.felText}</span>
                      {m.firma ? <span>{m.firma}</span> : null}
                      <span>{m.cine}</span>
                      {(m.atasamente || []).length ? <span>📎 {m.atasamente.length}</span> : null}
                      <span style={'margin-left:auto;font-weight:700;color:' + (m.stare === 'esuat' ? 'var(--red)' : 'var(--accent)')}>{m.stare === 'esuat' ? 'n-a plecat' : 'trimis'}</span>
                    </div>
                  </div>
                ))}
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
                    <button class="btn btn-primary" disabled={!meta?.activ} onClick={raspunde} style="flex:1 1 100%"><Icon name="mail" size={16} /> Răspunde</button>
                    <button class="btn" onClick={necitit} style={'flex:1;' + btnAlt}>Marchează necitit</button>
                    <button class="btn" onClick={sterge} style={'flex:1;' + btnAlt + ';color:var(--red)'}>Șterge</button>
                  </div>
                </>
              ) : (
                <>
                  <div style="font-size:12.5px;color:var(--text-secondary);line-height:1.7;margin-bottom:10px;overflow-wrap:anywhere">
                    <b>De la:</b> {deschis.de_la}<br /><b>Către:</b> {deschis.catre}<br /><b>Când:</b> {cand(deschis.la)} · {deschis.felText}
                    {deschis.firma ? ' · ' + deschis.firma : ''} · {deschis.cine}
                    {deschis.stare === 'esuat' && <><br /><span style="color:var(--red)"><b>N-a plecat:</b> {deschis.eroare}</span></>}
                    {(deschis.atasamente || []).length ? <><br /><b>Atașamente:</b> {deschis.atasamente.map((x: any) => x.nume + (x.octeti ? ' (' + oct(x.octeti) + ')' : '')).join(', ')}</> : null}
                  </div>
                  {/* HTML-ul emailului stă într-un cadru izolat: fără scripturi, fără acces la aplicație. */}
                  {deschis.html
                    ? <iframe sandbox="" referrerpolicy="no-referrer" title="Conținutul emailului" style="width:100%;min-height:380px;border:1px solid var(--border);border-radius:10px;background:#fff"
                        srcdoc={csp(true) + deschis.html} />
                    : <div style="white-space:pre-wrap;font-size:14px;line-height:1.55;overflow-wrap:anywhere">{deschis.text || ''}</div>}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {scrie && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) setScrie(false); }}>
          <div class="sheet" style="max-height:94vh">
            <div class="sheet-h"><b><Icon name="edit" size={18} color="var(--accent)" /> {form.raspunsLa ? 'Răspuns' : 'Email nou'}</b>
              <button class="h-btn" onClick={() => !busy && setScrie(false)} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              <label style={eticheta}>De la</label>
              {/* Răspunsul pleacă de pe adresa pe care a venit emailul (așa cere și serverul). */}
              <select value={form.de_la} disabled={!!form.raspunsLa} onChange={(e) => setForm({ ...form, de_la: (e.target as HTMLSelectElement).value })} style={camp}>
                {(meta?.adrese || []).filter((a: any) => !form.raspunsLa || a.adresa === form.de_la).map((a: any) => <option value={a.adresa}>{a.nume + ' <' + a.adresa + '>'}</option>)}
              </select>
              <label style={eticheta}>Către</label>
              <input type="email" value={form.catre} onInput={(e) => setForm({ ...form, catre: (e.target as HTMLInputElement).value })}
                placeholder="adresa@firma.ro — mai multe, despărțite prin virgulă" style={camp} />
              <label style={eticheta}>Subiect</label>
              <input type="text" maxLength={200} value={form.subiect} onInput={(e) => setForm({ ...form, subiect: (e.target as HTMLInputElement).value })} style={camp} />
              <label style={eticheta}>Mesaj</label>
              <textarea value={form.text} onInput={(e) => setForm({ ...form, text: (e.target as HTMLTextAreaElement).value })} style={camp + ';min-height:170px;resize:vertical;line-height:1.5'} />
              <label style={eticheta}>Atașamente (cel mult {oct(meta?.limite?.atasamenteOcteti)} în total)</label>
              <input ref={fisRef} type="file" multiple style="font-size:13px;color:var(--text-secondary)" />
              <button class="btn btn-primary" disabled={busy} onClick={trimite} style="width:100%;margin-top:16px">{busy ? 'Se trimite…' : 'Trimite'}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
