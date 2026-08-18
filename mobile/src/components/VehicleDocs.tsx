// VehicleDocs — actele vehiculului, în foaia de editare: listă + scanare + adăugare.
// Paritate cu fila „Documente" de pe web (aceeași regulă: aplicația PROPUNE, omul confirmă).
//
// Decizie: FĂRĂ plugin nativ de cameră. Un <input type="file" capture="environment"> deschide
// camera direct în WebView-ul Android — zero permisiuni noi, zero dependințe native, zero risc
// la build. Pluginul ar fi adus doar reglaje fine de care nu avem nevoie la o poză de talon.
import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { api, API_BASE, getAuthToken } from '../api/client';
import { showToast } from '../app/store';
import { Icon } from './Icon';

const DOC_TYPES = ['ITP', 'RCA', 'CASCO', 'Rovinietă', 'Licență transport', 'Tahograf', 'Altul'];

// Câmpurile din propunere care aparțin FIȘEI (nu actului) — se aplică prin setFisa în formularul
// de editare deja deschis. Etichetele sunt pentru ecranul de confirmare.
const FISA_ET: Record<string, string> = {
  plate: 'Nr. înmatriculare', vin: 'Serie șasiu (VIN)', brand: 'Marca', model: 'Model', year: 'An',
  fuel_type: 'Combustibil', displacement: 'Cilindree', power_kw: 'Putere (kW)',
  passenger_seats: 'Locuri', tare_weight: 'Masă proprie (kg)', max_weight_legal: 'Masă maximă (kg)',
  vehicle_type: 'Categorie (propusă din talon)',
};
const ACT_ET: Record<string, string> = {
  doc_type: 'Tip act', number: 'Serie/nr.', issuer: 'Emitent', issue_date: 'Emis la', expiry_date: 'EXPIRĂ la',
};

// Pozele de telefon au 5-12 MB; limita serverului e 4. Micșorăm în WebView înainte de trimitere.
function shrink(file: File): Promise<{ b64: string; mime: string; name: string }> {
  return new Promise((resolve, reject) => {
    if (file.type === 'application/pdf') {
      if (file.size > 4 * 1024 * 1024) return reject(new Error('PDF-ul e prea mare (' + (file.size / 1048576).toFixed(1) + ' MB, limita 4). Fă o poză paginii.'));
      const fr = new FileReader();
      fr.onload = () => resolve({ b64: String(fr.result).split(',')[1], mime: 'application/pdf', name: file.name });
      fr.onerror = () => reject(new Error('Nu am putut citi fișierul.'));
      fr.readAsDataURL(file);
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const sc = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      const du = c.toDataURL('image/jpeg', 0.78);
      resolve({ b64: du.split(',')[1], mime: 'image/jpeg', name: (file.name || 'act').replace(/\.[^.]+$/, '') + '.jpg' });
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Fișierul nu e o imagine sau un PDF.')); };
    img.src = url;
  });
}

const incBadge = (v: number) => v >= 0.85
  ? <span style="color:var(--accent);font-size:10px">sigur</span>
  : v >= 0.6 ? <span style="color:#f59e0b;font-size:10px">probabil</span>
  : <span style="color:#ef4444;font-size:10px">verifică</span>;

export function VehicleDocs({ imei, fisa, setFisa }: { imei: string; fisa: any; setFisa: (patch: any) => void }) {
  const [docs, setDocs] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [prop, setProp] = useState<any>(null);            // răspunsul /scan
  const [bife, setBife] = useState<Record<string, boolean>>({});
  const [fisier, setFisier] = useState<{ b64: string; mime: string; name: string } | null>(null);
  const [form, setForm] = useState<any>({ doc_type: 'ITP', number: '', issuer: '', issue_date: '', expiry_date: '', cost: '' });
  const [poza, setPoza] = useState<{ id: number; url: string } | null>(null);
  const [editId, setEditId] = useState<number | null>(null);   // actul aflat în modificare

  const reload = () => api<any[]>('/api/documents?imei=' + encodeURIComponent(imei)).then((d) => setDocs(Array.isArray(d) ? d : [])).catch(() => setDocs([]));
  useEffect(() => { reload(); setProp(null); setFisier(null); }, [imei]);

  async function scan(file: File | undefined) {
    if (!file) return;
    setBusy(true); setProp(null);
    try {
      const f = await shrink(file);
      const r = await api<any>('/api/documents/scan', { method: 'POST', body: { b64: f.b64, mime: f.mime, tip: 'auto' } });
      setFisier(f); setProp(r);
      // Bifat implicit: încredere ≥0.6 ȘI câmpul-țintă gol — ce a scris omul nu se suprascrie tăcut.
      const b: Record<string, boolean> = {};
      const c = r.campuri || {};
      for (const k of Object.keys(c)) {
        const ocupat = k in FISA_ET ? String(fisa?.[k] ?? '').trim() !== '' : false;
        // Bifat = tot ce s-a citit, mai puțin ce ai scris deja tu. Încrederea doar etichetează
        // (sigur/probabil/verifică) — dacă ar și reține bifa, câmpurile citite mai greu ar rămâne
        // goale după „confirmă", iar funcția ar părea că nu merge.
        b[k] = !ocupat;
      }
      setBife(b);
    } catch (e: any) { showToast(e?.message || 'Nu am putut citi actul', true); }
    finally { setBusy(false); }
  }

  // Validarea SALVEAZĂ actul, nu doar completează căsuțele: fluxul e unul singur — încarci, vezi ce
  // s-a citit, confirmi, actul e în listă. Câmpurile FIȘEI rămân doar completate, pentru că aparțin
  // vehiculului și se salvează cu butonul lui.
  async function aplica() {
    const c = (prop && prop.campuri) || {};
    const patchFisa: any = {}; let inFisa = 0;
    const f2 = { ...form };
    for (const k of Object.keys(c)) {
      if (!bife[k]) continue;
      if (k in ACT_ET) (f2 as any)[k] = String(c[k]);
      else if (k in FISA_ET) { patchFisa[k] = c[k]; inFisa++; }
    }
    setForm(f2);
    if (inFisa) setFisa(patchFisa);
    setProp(null);
    // Salvăm din valorile calculate ACUM (f2), nu din starea formularului: setForm e asincron, iar
    // o citire imediată a stării ar trimite valorile vechi.
    if (f2.doc_type) await adauga(f2, inFisa);
    else showToast('Completat în formular — alege tipul actului și apasă „Adaugă".');
  }

  // Modificarea unui act: același formular, comutat în modul „modifică". Fără al doilea formular,
  // care ar fi însemnat două locuri de întreținut și două ocazii de a diverge.
  function editeaza(d: any) {
    const zi = (v: any) => (v ? String(v).slice(0, 10) : '');
    setEditId(d.id);
    setForm({ doc_type: d.doc_type || 'ITP', number: d.number || '', issuer: d.issuer || '', issue_date: zi(d.issue_date), expiry_date: zi(d.expiry_date), cost: d.cost != null ? String(d.cost) : '' });
  }
  function anuleazaEditarea() {
    setEditId(null);
    setForm({ doc_type: 'ITP', number: '', issuer: '', issue_date: '', expiry_date: '', cost: '' });
  }

  // `date` permite salvarea din valori calculate pe loc (după validarea scanării), fără să aștepte
  // ca starea formularului să se actualizeze.
  async function adauga(date?: any, campuriFisa?: number) {
    const f = date || form;
    if (!f.doc_type) { showToast('Alege tipul actului', true); return; }
    try {
      const body: any = { imei, doc_type: f.doc_type, number: f.number || null, issuer: f.issuer || null, issue_date: f.issue_date || null, expiry_date: f.expiry_date || null, cost: f.cost !== '' && f.cost != null ? Number(f.cost) : null };
      // Fișierul se atașează DOAR aici — renunțarea nu lasă nimic pe server. La MODIFICARE se
      // trimite doar dacă s-a scanat unul nou: o corectură de dată nu are voie să șteargă scanul.
      if (fisier) { body.file_b64 = fisier.b64; body.file_mime = fisier.mime; body.file_name = fisier.name; }
      if (editId) await Api.updateDocument(editId, body); else await Api.createDocument(body);
      setEditId(null);
      setFisier(null); setForm({ doc_type: 'ITP', number: '', issuer: '', issue_date: '', expiry_date: '', cost: '' });
      showToast((editId ? 'Act modificat' : 'Act salvat')
        + (f.expiry_date ? ' — alertele de expirare sunt active' : ' — fără dată de expirare, nu vei fi alertat')
        + (campuriFisa ? ' · ' + campuriFisa + ' câmpuri în fișă, apasă „Salvează"' : ''));
      reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
  }

  // Vizualizarea actului: linkul simplu n-ar căra tokenul Bearer → aducem imaginea cu antet și o
  // arătăm inline dintr-un blob. Merge identic în browser și în WebView.
  async function veziPoza(id: number) {
    if (poza && poza.id === id) { URL.revokeObjectURL(poza.url); setPoza(null); return; }
    try {
      const res = await fetch(API_BASE + '/api/documents/' + id + '/file', { headers: getAuthToken() ? { Authorization: 'Bearer ' + getAuthToken() } : undefined });
      if (!res.ok) throw new Error('Actul nu are fișier');
      const url = URL.createObjectURL(await res.blob());
      if (poza) URL.revokeObjectURL(poza.url);
      setPoza({ id, url });
    } catch (e: any) { showToast(e?.message || 'Nu am putut deschide actul', true); }
  }

  // PDF-ul nu se poate afișa în pagină pe telefon. Îl aducem cu tokenul (un link simplu nu-l cară)
  // și îl predăm sistemului: se deschide în vizualizatorul de PDF-uri și se poate salva de acolo.
  async function deschideFisier(id: number) {
    try {
      const res = await fetch(API_BASE + '/api/documents/' + id + '/file', { headers: getAuthToken() ? { Authorization: 'Bearer ' + getAuthToken() } : undefined });
      if (!res.ok) throw new Error('Actul nu are fișier');
      const url = URL.createObjectURL(await res.blob());
      try { (window as any).open(url, '_system'); } catch { window.open(url, '_blank'); }
      // Nu revocăm imediat: vizualizatorul citește adresa după ce ecranul nostru pierde focusul.
      setTimeout(() => { try { URL.revokeObjectURL(url); } catch {} }, 60000);
    } catch (e: any) { showToast(e?.message || 'Nu am putut deschide actul', true); }
  }

  const azi = Date.now(), curand = 30 * 24 * 3600 * 1000;
  const setF = (k: string, v: any) => setForm((p: any) => ({ ...p, [k]: v }));

  return (
    <div style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <div style="font-size:12.5px;font-weight:700;color:var(--accent);margin-bottom:8px"><Icon name="fileBar" size={13} /> Documente vehicul</div>

      {/* Scanare */}
      <label class="btn" style="display:flex;align-items:center;justify-content:center;gap:8px;border:1.5px dashed var(--border);background:transparent;margin-bottom:10px;cursor:pointer">
        <input type="file" accept="image/*,application/pdf" capture="environment" style="display:none"
          onChange={(e) => { const f = (e.target as HTMLInputElement).files?.[0]; scan(f); (e.target as HTMLInputElement).value = ''; }} />
        {busy ? <span>Citesc actul…</span> : <><Icon name="sparkles" size={15} /> <span>Fotografiază / încarcă actul — completez eu câmpurile</span></>}
      </label>

      {/* Propuneri */}
      {prop && (
        <div style="border:1px solid var(--accent);border-radius:12px;padding:10px;margin-bottom:10px">
          <div style="font-size:12px;font-weight:700;margin-bottom:6px">Am citit ({prop.sursa === 'pdf-text' ? 'text din PDF, gratuit' : 'citire AI'}) — debifează ce nu vrei:</div>
          {Object.keys(prop.campuri || {}).filter((k) => k in ACT_ET || k in FISA_ET).map((k) => {
            const ocupat = k in FISA_ET && String(fisa?.[k] ?? '').trim() !== '';
            return (
              <label style="display:flex;align-items:center;gap:8px;padding:4px 0;font-size:12.5px">
                <input type="checkbox" checked={!!bife[k]} onChange={(e) => setBife((p) => ({ ...p, [k]: (e.target as HTMLInputElement).checked }))} />
                <span style="min-width:120px;color:var(--text-muted)">{(ACT_ET as any)[k] || (FISA_ET as any)[k]}</span>
                <b style="flex:1;word-break:break-all">{String(prop.campuri[k])}</b>
                {incBadge((prop.incredere || {})[k] || 0)}
                {ocupat && <span style="font-size:10px;color:#f59e0b">deja completat</span>}
              </label>
            );
          })}
          <div style="display:flex;gap:8px;margin-top:8px">
            <button class="btn btn-primary" style="flex:1" onClick={aplica}>Validează și adaugă actul</button>
            <button class="btn" onClick={() => { setProp(null); setFisier(null); }}>Renunță</button>
          </div>
          <div style="font-size:10.5px;color:var(--text-muted);margin-top:6px">La validare actul se salvează și apare în listă. Câmpurile pentru fișă se completează în formular — pe alea le salvezi cu „Salvează".</div>
        </div>
      )}

      {/* Lista actelor */}
      {docs.map((d) => {
        const exp = d.expiry_date ? new Date(d.expiry_date).getTime() : null;
        const badge = exp == null ? <span style="color:var(--text-muted)">fără dată — fără alerte</span>
          : exp < azi ? <span style="color:#ef4444;font-weight:600">EXPIRAT</span>
          : exp - azi < curand ? <span style="color:#f59e0b;font-weight:600">expiră {new Date(exp).toLocaleDateString('ro-RO')}</span>
          : <span style="color:var(--accent)">valid până {new Date(exp).toLocaleDateString('ro-RO')}</span>;
        return (
          <div style="border-bottom:1px solid var(--border);padding:7px 0">
            <div style="display:flex;align-items:center;gap:8px">
              <div style="flex:1;min-width:0">
                <b style="font-size:13px">{d.doc_type}</b>{d.number ? <span style="font-size:12px"> · {d.number}</span> : null}
                <div style="font-size:11.5px">{badge}</div>
              </div>
              {/* Imaginile se deschid AICI, sub act. Un PDF nu intră într-un <img>, deci pentru el
                  butonul deschide fișierul în afara aplicației (vizualizator/descărcare) — altfel
                  actul ar fi fost stocat și inaccesibil de pe telefon. */}
              {d.has_file && (String(d.file_mime || '').startsWith('image/')
                ? <button class="h-btn" onClick={() => veziPoza(d.id)} aria-label="Vezi actul"><Icon name="eye" size={16} /></button>
                : <button class="h-btn" onClick={() => deschideFisier(d.id)} aria-label="Deschide actul"><Icon name="fileBar" size={16} /></button>)}
              <button class="h-btn" onClick={() => editeaza(d)} aria-label="Modifică actul"><Icon name="edit" size={16} /></button>
              <button class="h-btn" onClick={() => Api.deleteDocument(d.id).then(reload).catch(() => showToast('Eroare la ștergere', true))} aria-label="Șterge"><Icon name="trash" size={16} /></button>
            </div>
            {poza && poza.id === d.id && (
              <img src={poza.url} style="max-width:100%;border-radius:10px;margin-top:6px" onClick={() => veziPoza(d.id)} />
            )}
          </div>
        );
      })}
      {!docs.length && <div style="font-size:12px;color:var(--text-muted);padding:4px 0">Niciun act încă.</div>}

      {/* Adăugare / editare manuală */}
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px">
        <div class="fld"><label>Tip</label>
          <select value={form.doc_type} onChange={(e) => setF('doc_type', (e.target as HTMLSelectElement).value)}>{DOC_TYPES.map((t) => <option value={t}>{t}</option>)}</select>
        </div>
        <div class="fld"><label>Serie / nr.</label><input value={form.number} onInput={(e) => setF('number', (e.target as HTMLInputElement).value)} /></div>
        <div class="fld"><label>Emitent</label><input value={form.issuer} onInput={(e) => setF('issuer', (e.target as HTMLInputElement).value)} /></div>
        <div class="fld"><label>Cost (RON)</label><input type="number" value={form.cost} onInput={(e) => setF('cost', (e.target as HTMLInputElement).value)} /></div>
        <div class="fld"><label>Emis la</label><input type="date" value={form.issue_date} onInput={(e) => setF('issue_date', (e.target as HTMLInputElement).value)} /></div>
        <div class="fld"><label>Expiră la</label><input type="date" value={form.expiry_date} onInput={(e) => setF('expiry_date', (e.target as HTMLInputElement).value)} /></div>
      </div>
      <div style="display:flex;gap:8px;margin-top:8px">
        <button class="btn btn-primary" style="flex:1" onClick={() => adauga()}>
          {editId ? 'Salvează modificarea' : (fisier ? 'Adaugă actul (cu fișierul scanat)' : 'Adaugă actul')}
        </button>
        {editId ? <button class="btn" onClick={anuleazaEditarea}>Renunță</button> : null}
      </div>
    </div>
  );
}
