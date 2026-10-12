import { useEffect, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import './detail.css';
import './admin.css';

// Panoul Mail (Robert, 12.10: „noi adminii să avem un panou de mail" — „și pe telefon, bineînțeles"). Etapa 1, ca pe
// web (Administrare → Mail): „Trimise" + „Scrie". Telefonul NU hotărăște nimic: ce adrese vezi (adresa comună + a ta),
// starea fiecărui email, spațiul ocupat și felul emailului (textul) le dă serverul. Aceleași cuvinte ca pe web.

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
const camp = 'width:100%;box-sizing:border-box;padding:11px 12px;border-radius:10px;border:1px solid var(--border);background:var(--bg-dark);color:var(--text-primary);font:inherit;font-size:15px';
const eticheta = 'display:block;font-size:12px;font-weight:700;color:var(--text-secondary);margin:12px 0 5px';

export function Mail() {
  const loc = useLocation();
  const isSuper = !!me.value?.isSuper;
  const [meta, setMeta] = useState<any | null>(null);
  const [lista, setLista] = useState<any[] | null>(null);
  const [maiSunt, setMaiSunt] = useState(false);
  const [pagina, setPagina] = useState(0);
  const [filtru, setFiltru] = useState('');
  const [cauta, setCauta] = useState('');
  const [err, setErr] = useState('');
  const [deschis, setDeschis] = useState<any | null>(null);
  const [scrie, setScrie] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({ de_la: '', catre: '', subiect: '', text: '' });
  const fisRef = useRef<HTMLInputElement>(null);
  const cautaT = useRef<any>(null);

  async function incarcaMeta() {
    try {
      const m = await Api.mailAdrese();
      setMeta(m);
      if (filtru && !(m.adrese || []).some((x: any) => x.adresa === filtru)) setFiltru('');
    } catch (e: any) { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Nu s-a putut încărca panoul de mail.')); }
  }
  async function incarcaLista(p: number, adauga: boolean, f = filtru, q = cauta) {
    try {
      const j = await Api.mailTrimise({ adresa: f || undefined, cauta: q || undefined, pagina: p });
      setLista((v) => (adauga && v ? v.concat(j.mailuri || []) : (j.mailuri || [])));
      setMaiSunt(!!j.maiSunt); setPagina(p);
    } catch (e: any) { setErr(e?.message || 'Nu s-a putut încărca lista.'); setLista([]); }
  }
  function reload() { setErr(''); setLista(null); incarcaMeta(); incarcaLista(0, false); }
  useEffect(() => { if (isSuper) reload(); }, []);
  useEffect(() => { if (isSuper && meta) { setLista(null); incarcaLista(0, false); } }, [filtru]);

  function laCautare(v: string) {
    setCauta(v);
    clearTimeout(cautaT.current);
    cautaT.current = setTimeout(() => incarcaLista(0, false, filtru, v.trim()), 350);
  }
  async function deschide(id: number) {
    setDeschis({ incarca: true });
    try { setDeschis(await Api.mailTrimis(id)); }
    catch (e: any) { setDeschis(null); showToast(e?.message || 'Emailul nu se poate deschide.', true); }
  }
  function nou() {
    if (!meta?.activ) { showToast('Serverul n-are email configurat.', true); return; }
    const adr = meta.adrese || [];
    const aMea = adr.find((x: any) => x.aMea);
    setForm({ de_la: (aMea || adr.find((x: any) => x.comuna) || adr[0] || {}).adresa || '', catre: '', subiect: '', text: '' });
    setScrie(true);
  }
  async function trimite() {
    const fis = Array.from(fisRef.current?.files || []);
    const total = fis.reduce((s, f) => s + (f.size || 0), 0);
    const lim = meta?.limite?.atasamenteOcteti || 0;
    if (lim && total > lim) { showToast('Atașamentele trec de ' + oct(lim) + '.', true); return; }
    setBusy(true);
    try {
      const atasamente = await Promise.all(fis.map(citeste));
      await Api.mailTrimite({ ...form, atasamente });
      showToast('Emailul a plecat ✓');
      setScrie(false); reload();
    } catch (e: any) { showToast(e?.message || 'Emailul n-a plecat.', true); }
    finally { setBusy(false); }
  }

  const sp = meta?.spatiu || {};
  const pct = sp.bazaOcteti && sp.capOcteti ? Math.min(100, Math.round(sp.bazaOcteti / sp.capOcteti * 100)) : null;

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
                <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px">
                  {meta.activ
                    ? <>Emailul pleacă prin {meta.cale === 'brevo' ? 'Brevo' : 'SMTP'}.</>
                    : <span style="color:var(--red)">Serverul n-are email configurat: nu pleacă nimic până nu se pune cheia Brevo în Railway.</span>}
                </div>
                <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:8px">
                  <button onClick={() => setFiltru('')} style={chip(!filtru)}>Toate</button>
                  {(meta.adrese || []).map((a: any) => (
                    <button onClick={() => setFiltru(a.adresa)} style={chip(filtru === a.adresa)}>{a.comuna ? a.adresa : a.adresa + ' (a mea)'}</button>
                  ))}
                </div>
                <div style="display:flex;gap:8px;margin-bottom:12px">
                  <input type="search" value={cauta} onInput={(e) => laCautare((e.target as HTMLInputElement).value)}
                    placeholder="Caută după destinatar sau subiect…" style={camp + ';flex:1;font-size:14px'} />
                  <button class="btn btn-primary" disabled={!meta.activ} onClick={nou} style="white-space:nowrap"><Icon name="edit" size={16} /> Scrie</button>
                </div>
              </>
            )}
            {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
            {lista == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
            {lista && lista.length === 0 && !err && <div class="adm-empty"><Icon name="mail" size={40} class="ic" /><div>{cauta ? 'Nimic găsit.' : 'Niciun email trimis încă.'}</div></div>}
            {lista && lista.length > 0 && (
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
                {maiSunt && <button class="btn" onClick={() => incarcaLista(pagina + 1, true)} style="width:100%;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)">Mai multe</button>}
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
              {deschis.incarca ? <div class="spin" style="margin:20px auto" /> : (
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
                        srcdoc={'<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; img-src https: data:; style-src \'unsafe-inline\'">' + deschis.html} />
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
            <div class="sheet-h"><b><Icon name="edit" size={18} color="var(--accent)" /> Email nou</b>
              <button class="h-btn" onClick={() => !busy && setScrie(false)} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              <label style={eticheta}>De la</label>
              <select value={form.de_la} onChange={(e) => setForm({ ...form, de_la: (e.target as HTMLSelectElement).value })} style={camp}>
                {(meta?.adrese || []).map((a: any) => <option value={a.adresa}>{a.nume + ' <' + a.adresa + '>'}</option>)}
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
