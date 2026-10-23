import { useEffect, useRef, useState } from 'preact/hooks';
import { showToast } from '../app/store';
import { Api, type LocatieDurata, type LocatieActiva } from '../api/endpoints';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { Icon } from './Icon';
import './distribuieLocatia.css';

// „Distribuie locația" (Robert, 21.10): foaia din fișa mașinii, ca pe web (fereastra „Distribuie locația live").
// Aceleași rute, aceleași reguli — duratele, textul mesajului, orele și „cine poate" le dă serverul
// (locatie_distribuita.js). Foaia doar le arată. Linkul se vede o singură dată, când e făcut: în bază stă doar
// amprenta lui, deci nu se poate arăta din nou — se face altul. „Prelungește" (23.10) mută ora de final a aceluiași link.
const BTN_GHOST = 'background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)';

export function DistribuieLocatia({ imei, nume, onClose }: { imei: string; nume: string; onClose: () => void }) {
  const [durate, setDurate] = useState<LocatieDurata[]>([]);
  const [minute, setMinute] = useState<number | null>(null);
  const [active, setActive] = useState<LocatieActiva[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [facut, setFacut] = useState<{ id: number; link: string; mesaj: string; text: string } | null>(null);
  const [deOprit, setDeOprit] = useState<LocatieActiva | null>(null);
  const [prel, setPrel] = useState<number | null>(null);      // linkul la care e deschisă alegerea „Cu cât?"
  const [notaPrel, setNotaPrel] = useState('');
  const ref = useRef<HTMLTextAreaElement>(null);

  // „Înapoi" pe Android: întâi întrebarea de oprire, apoi foaia.
  useInapoiInchide(true, () => { if (deOprit) { setDeOprit(null); return true; } onClose(); return true; });

  function incarca() {
    Api.locatieDistribuita(imei).then((r) => {
      const d = Array.isArray(r.durate) ? r.durate : [];
      setDurate(d);
      setMinute((m) => (m != null && d.some((x) => x.minute === m)) ? m : ((d.find((x) => x.minute === 60) || d[0] || { minute: null }) as any).minute);
      setActive(Array.isArray(r.active) ? r.active : []);
      setNotaPrel(r.prelungire || '');
    }).catch((e: any) => setErr(e?.message || 'Nu am putut citi linkurile.'));
  }
  useEffect(incarca, [imei]);

  async function fa() {
    if (minute == null) return;
    setBusy(true); setErr('');
    try {
      const r = await Api.faLocatieDistribuita(imei, minute);
      setFacut({ id: r.id, link: r.link, mesaj: r.mesaj, text: 'Linkul merge ' + r.durata + ', până la ' + r.pana + '.' });
      incarca();
    } catch (e: any) { setErr(e?.message || 'Nu am putut face linkul.'); }
    finally { setBusy(false); }
  }
  async function copiaza() {
    if (!facut) return;
    try { await navigator.clipboard.writeText(facut.link); showToast('Link copiat'); }
    catch {
      const el = ref.current;
      if (el) { el.focus(); el.select(); }
      showToast('Nu am putut copia — ține apăsat pe link și copiază-l.', true);
    }
  }
  async function trimite() {
    if (!facut) return;
    try {
      const { Share } = await import('@capacitor/share');
      await Share.share({ title: 'Locație live', text: facut.mesaj });
    } catch (e: any) {
      if (/cancel/i.test(String(e?.message || ''))) return; // omul a închis foaia de partajare — nu e o eroare
      showToast('Nu am putut deschide trimiterea — copiază linkul.', true);
    }
  }
  function whatsapp() {
    if (!facut) return;
    const url = 'https://wa.me/?text=' + encodeURIComponent(facut.mesaj);
    try { (window as any).open(url, '_system'); } catch { window.open(url, '_blank'); }
  }
  async function prelungeste(l: LocatieActiva, m: number) {
    setBusy(true); setErr('');
    try {
      const r = await Api.prelungesteLocatieDistribuita(imei, l.id, m);
      showToast(r.text || 'Linkul s-a prelungit.');
      setPrel(null);
      if (facut && facut.id === l.id) setFacut({ ...facut, text: 'Linkul merge până la ' + r.pana + '.' });
    } catch (e: any) { setErr(e?.message || 'Nu am putut prelungi linkul.'); }
    finally { setBusy(false); incarca(); }
  }
  async function opreste(l: LocatieActiva) {
    setBusy(true); setErr('');
    try {
      const r = await Api.opresteLocatieDistribuita(imei, l.id);
      showToast(r.text || 'Linkul s-a oprit.');
      if (facut && facut.id === l.id) setFacut(null);
    } catch (e: any) { setErr(e?.message || 'Nu am putut opri linkul.'); }
    finally { setBusy(false); setDeOprit(null); incarca(); }
  }

  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet dl-sheet">
        <div class="sheet-h"><b><Icon name="share" size={18} color="var(--accent)" /> Distribuie locația live</b><button class="h-btn" onClick={onClose} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="dl-masina">{nume}</div>
          <p class="dl-intro">Oricine are linkul vede mașina pe hartă, live, până expiră. După aceea linkul nu mai merge.</p>
          {!facut && (
            <div>
              <div class="dl-et">Cât timp?</div>
              <div class="dl-durate" role="radiogroup" aria-label="Cât timp">
                {durate.map((d) => (
                  <button key={d.minute} type="button" role="radio" aria-checked={d.minute === minute}
                    class={'dl-dur' + (d.minute === minute ? ' on' : '')} onClick={() => setMinute(d.minute)}>{d.text}</button>
                ))}
              </div>
              <button class="btn btn-primary dl-fa" disabled={busy || minute == null} onClick={fa}>
                <Icon name="share" size={16} color="#06210f" /> {busy ? 'Se face linkul…' : 'Creează linkul'}
              </button>
            </div>
          )}
          {facut && (
            <div>
              <div class="dl-et">{facut.text}</div>
              <textarea ref={ref} readOnly rows={2} value={facut.link} class="dl-link"
                onFocus={(e) => (e.target as HTMLTextAreaElement).select()} />
              <div class="frm-actions">
                <button class="btn" style={BTN_GHOST} onClick={copiaza}><Icon name="copy" size={16} /> Copiază</button>
                <button class="btn btn-primary" onClick={trimite}><Icon name="forward" size={16} color="#06210f" /> Trimite</button>
              </div>
              <div class="frm-actions">
                <button class="btn" style={BTN_GHOST} onClick={whatsapp}><Icon name="phone" size={16} /> WhatsApp</button>
                <button class="btn" style={BTN_GHOST} onClick={() => setFacut(null)}><Icon name="plus" size={16} /> Alt link</button>
              </div>
              <div class="dl-nota">Linkul se vede doar acum. Copiază-l sau trimite-l înainte să închizi foaia.</div>
            </div>
          )}
          {err && <div class="dl-err" role="alert">{err}</div>}
          {active.length > 0 && <div class="dl-cap">Linkuri active pe mașina asta</div>}
          {active.map((l) => (
            <div class="dl-act" key={l.id}>
              <div class="dl-act-t">
                <div class="dl-act-a">{'Până la ' + l.pana + ' · ' + l.ramas}</div>
                <div class="dl-act-b">{'Făcut la ' + l.creat + (l.creatDe ? ' de ' + (l.alMeu ? 'tine' : l.creatDe) : '') + (facut && l.id === facut.id ? ' · cel de mai sus' : '')}</div>
              </div>
              <div class="dl-act-bt">
                {l.poatePrelungi && (
                  <button class="btn dl-stop" style={BTN_GHOST + (prel === l.id ? ';border-color:var(--accent)' : '')} disabled={busy}
                    aria-expanded={prel === l.id} onClick={() => setPrel(prel === l.id ? null : l.id)}>Prelungește</button>
                )}
                <button class="btn dl-stop" style={BTN_GHOST} disabled={busy} onClick={() => { if (prel === l.id) setPrel(null); setDeOprit(l); }}>Oprește</button>
              </div>
              {l.poatePrelungi && prel === l.id && (
                <div class="dl-prel">
                  <span class="dl-prel-et">Cu cât?</span>
                  {durate.map((d) => (
                    <button key={d.minute} type="button" class="btn dl-prel-d" style={BTN_GHOST} disabled={busy}
                      onClick={() => prelungeste(l, d.minute)}>{'+' + d.text}</button>
                  ))}
                </div>
              )}
            </div>
          ))}
          {active.length > 0 && notaPrel && <div class="dl-nota">{notaPrel}</div>}
        </div>
      </div>
      {deOprit && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) setDeOprit(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b>Oprești linkul?</b><button class="h-btn" onClick={() => setDeOprit(null)} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              <p class="dl-intro">Cine îl are nu mai vede mașina.</p>
              <div class="frm-actions">
                <button class="btn" style={BTN_GHOST} onClick={() => setDeOprit(null)}>Renunț</button>
                <button class="btn btn-primary" disabled={busy} onClick={() => opreste(deOprit)}>Oprește</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
