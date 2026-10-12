// Semiremorcile și remorcile cu proțap (simulatorul de încărcare, Robert 12.10) — pe web stau în Administrare → Vehicule,
// ca rânduri fără semnal. Pe telefon lista de vehicule e harta vie (stări, poziții), deci ele au ecranul lor, deschis din
// Vehicule. Aceleași rute (/api/remorci), aceleași reguli (lib/incarcare.ts = oglinda paginii); serverul curăță tot.
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { Confirma } from '../components/FlotaUi';
import { VehicleArt } from '../components/VehicleArt';
import { modulIncarcare, remorcaText, remorcaObisnuite, remorcaDinRand, REM_CAMPURI, type IncMeta, type Remorca } from '../lib/incarcare';
import './detail.css';
import './admin.css';
import './flota.css';

export function Remorci() {
  const loc = useLocation();
  const isSuper = !!me.value?.isSuper;
  const canWrite = !!me.value?.permissions?.manageFleet && !(me.value?.editariTaiate || []).includes('vehicule');
  const [list, setList] = useState<Remorca[] | null>(null);
  const [meta, setMeta] = useState<IncMeta | null>(null);
  const [err, setErr] = useState('');
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [id, setId] = useState<number | null>(null);
  const [firme, setFirme] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const [eroare, setEroare] = useState('');
  const [del, setDel] = useState(false);

  async function reload() {
    setErr('');
    try { const r = await Api.remorci(); setList(Array.isArray(r) ? r : []); }
    catch (e: any) { setErr(e?.status === 403 ? 'Simulatorul de încărcare nu e pornit pentru firma ta.' : (e?.message || 'Eroare la încărcare')); setList([]); }
  }
  useEffect(() => {
    if (!modulIncarcare(me.value)) { setErr('Simulatorul de încărcare nu e pornit pentru firma ta.'); setList([]); return; }
    reload();
    Api.incarcareMeta().then(setMeta).catch(() => {});
    if (isSuper) Api.companies().then((c) => setFirme(Array.isArray(c) ? c : [])).catch(() => {});
  }, []);

  function deschide(r: Remorca | null, fel = 'semiremorca') {
    if (!meta) return;
    let v = remorcaDinRand(r, fel);
    if (!r) {
      const primul = (meta.tipuriRemorca[fel] || [])[0];
      v.tip = primul ? primul.id : '';
      v = remorcaObisnuite(v, v.fel, v.tip, true, meta) as Record<string, string>;
      if (isSuper) v.company_id = '';
    }
    setEroare(''); setId(r ? r.id : null); setForm(v);
  }
  const pune = (patch: Record<string, string>) => setForm((p) => (p ? { ...p, ...patch } : p));
  function alegeFel(fel: string) {
    if (!form || !meta) return;
    const tip = ((meta.tipuriRemorca[fel] || [])[0] || { id: '' }).id;
    setForm(remorcaObisnuite({ ...form, fel, tip }, fel, tip, id == null, meta) as Record<string, string>);
  }
  function alegeTip(tip: string) {
    if (!form || !meta) return;
    // La una NOUĂ, tipul își pune cifrele peste tot; la una salvată, doar în căsuțele goale (ca pe web).
    setForm(remorcaObisnuite({ ...form, tip }, form.fel, tip, id == null, meta) as Record<string, string>);
  }
  async function salveaza() {
    if (!form) return;
    const b: any = { fel: form.fel, tip: form.tip || null, plate: form.plate, model: form.model, note: form.note };
    for (const k of REM_CAMPURI) b[k] = form[k];
    if (id == null && isSuper) b.company_id = form.company_id || null;
    setBusy(true); setEroare('');
    try {
      await Api.salveazaRemorca(id, b);
      showToast(id != null ? 'Salvat' : (form.fel === 'remorca' ? 'Remorcă adăugată' : 'Semiremorcă adăugată'));
      setForm(null); await reload();
    } catch (e: any) { setEroare(e?.message || 'Nu s-a putut salva.'); }
    finally { setBusy(false); }
  }
  async function sterge() {
    if (id == null) return;
    setBusy(true);
    try { await Api.stergeRemorca(id); setDel(false); setForm(null); showToast('Șters din flotă'); await reload(); }
    catch (e: any) { showToast(e?.message || 'Nu s-a putut șterge', true); }
    finally { setBusy(false); }
  }

  const nSemi = (list || []).filter((r) => r.fel !== 'remorca').length, nRem = (list || []).length - nSemi;
  const fel = form ? (meta?.felRemorca || []).find((f) => f.id === form.fel) : null;
  const camp = (k: string, l: string, step = '0.01') => (
    <div class="fld" key={k}><label>{l}</label>
      <input type="number" inputMode="decimal" step={step} value={form ? form[k] : ''} onInput={(e) => pune({ [k]: (e.target as HTMLInputElement).value })} />
    </div>
  );
  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/vehicles')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Semiremorci și remorci</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding:12px 14px 96px">
        {list != null && !err && (
          <div class="fl-count" style="margin:0 2px 10px">
            {nSemi + (nSemi === 1 ? ' semiremorcă' : ' semiremorci')} · {nRem + (nRem === 1 ? ' remorcă' : ' remorci')}
          </div>
        )}
        {err && <div class="fl-empty" style="color:var(--red)">{err}</div>}
        {list == null && !err && <div class="fl-empty"><div class="spin" style="margin:0 auto" /></div>}
        {canWrite && !err && meta && (
          <div style="display:flex;gap:8px;margin:0 0 12px">
            <button class="fl-ab" onClick={() => deschide(null, 'semiremorca')}><Icon name="plus" size={14} /> Semiremorcă</button>
            <button class="fl-ab" onClick={() => deschide(null, 'remorca')}><Icon name="plus" size={14} /> Remorcă</button>
          </div>
        )}
        {list != null && !err && (list.length ? (
          <div class="fl-list">
            {list.map((r) => (
              <button type="button" class="pf-card" disabled={!canWrite} onClick={() => canWrite && deschide(r)}
                style="display:flex;align-items:center;gap:12px;width:100%;margin:0;text-align:left;font-family:inherit;color:var(--text-primary);cursor:pointer">
                <span style="flex:0 0 auto;color:var(--text-secondary)"><VehicleArt cat="trailer" color="currentColor" width={44} /></span>
                <span style="flex:1;min-width:0">
                  <b style="display:block;font-size:15px">{r.plate}</b>
                  <span style="display:block;font-size:12.5px;color:var(--text-secondary);margin-top:2px">{remorcaText(r, meta)}</span>
                  <span style="display:block;font-size:12px;color:var(--text-muted);margin-top:2px">
                    {[r.sarcina_kg ? Number(r.sarcina_kg).toLocaleString('ro-RO') + ' kg sarcină utilă' : '', isSuper ? r.company_name : ''].filter(Boolean).join(' · ') || 'fără aparat GPS'}
                  </span>
                </span>
                {canWrite && <Icon name="edit" size={17} />}
              </button>
            ))}
          </div>
        ) : (
          <div class="fl-empty"><div class="ic"><Icon name="truck" size={30} /></div>Nicio semiremorcă sau remorcă trecută. Le treci o dată, cu dimensiunile, ca simulatorul de încărcare să le aibă gata.</div>
        ))}
      </div>

      {form && meta && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) setForm(null); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b><Icon name="truck" size={18} color="var(--accent)" /> {id != null ? (fel ? fel.et : 'Semiremorcă') : 'Adaugă ' + (fel ? fel.et.charAt(0).toLowerCase() + fel.et.slice(1) : 'semiremorcă')}</b>
              <button class="h-btn" onClick={() => { if (!busy) setForm(null); }} aria-label="Închide"><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              <div class="frm">
                {isSuper && id == null && (
                  <div class="fld"><label>Firma <span class="req">*</span></label>
                    <select value={form.company_id || ''} onChange={(e) => pune({ company_id: (e.target as HTMLSelectElement).value })}>
                      <option value="">— alege compania —</option>
                      {firme.map((c) => <option value={String(c.id)}>{c.name}</option>)}
                    </select>
                  </div>
                )}
                <div class="fld"><label>Ce este</label>
                  <select value={form.fel} onChange={(e) => alegeFel((e.target as HTMLSelectElement).value)}>
                    {meta.felRemorca.map((f) => <option value={f.id}>{f.et}</option>)}
                  </select>
                  {fel && <div style="font-size:11.5px;color:var(--text-muted);margin-top:4px">Se cuplează {fel.cuplare}.</div>}
                </div>
                <div class="fld"><label>Tipul</label>
                  <select value={form.tip} onChange={(e) => alegeTip((e.target as HTMLSelectElement).value)}>
                    {(meta.tipuriRemorca[form.fel] || []).map((t) => <option value={t.id}>{t.et}</option>)}
                    <option value="">Altul (scriu eu)</option>
                  </select>
                </div>
                <div class="fld"><label>Nr. înmatriculare <span class="req">*</span></label>
                  <input value={form.plate} maxLength={20} style="text-transform:uppercase" onInput={(e) => pune({ plate: (e.target as HTMLInputElement).value })} />
                </div>
                <div class="fld"><label>Marcă / model</label>
                  <input value={form.model} maxLength={80} placeholder="ex: Schmitz S.CS" onInput={(e) => pune({ model: (e.target as HTMLInputElement).value })} />
                </div>
                <div style="font-size:12px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.3px">Spațiul de încărcare (interior, în metri)</div>
                {camp('lungime_m', 'Lungime *')}
                {camp('latime_m', 'Lățime *')}
                {camp('inaltime_m', 'Înălțime *')}
                <div style="font-size:12px;font-weight:800;color:var(--text-secondary);text-transform:uppercase;letter-spacing:.3px">Greutăți și axe</div>
                {camp('sarcina_kg', 'Sarcină utilă (kg)', '1')}
                {camp('tara_kg', 'Tara (kg)', '1')}
                {camp('nr_axe', 'Număr de axe', '1')}
                {camp('pivot_axe_m', form.fel === 'remorca' ? 'Ampatament (m)' : 'De la pivot la axe (m)')}
                {form.fel === 'remorca' && camp('axa_fata_m', 'Până la axa față (m)')}
                {camp('limita_axe_kg', 'Limita pe axe (kg)', '1')}
                <div class="fld"><label>Note</label><textarea rows={2} maxLength={500} value={form.note} onInput={(e) => pune({ note: (e.target as HTMLTextAreaElement).value })} /></div>
                {eroare && <div style="padding:9px 12px;border-radius:9px;font-size:13px;font-weight:600;color:var(--red);background:rgba(239,68,68,.12);border:1px solid rgba(239,68,68,.35)">{eroare}</div>}
                <div class="frm-actions">
                  {id != null && <button class="btn btn-danger-ghost" style="flex:0 0 auto" disabled={busy} onClick={() => setDel(true)} aria-label="Șterge"><Icon name="trash" size={16} /></button>}
                  <button class="btn btn-primary" disabled={busy} onClick={salveaza}>{busy ? 'Se salvează…' : (id != null ? 'Salvează' : 'Adaugă')}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {del && form && (
        <Confirma title="Confirmare ștergere" okLabel="Șterge" danger busy={busy}
          text={'Ștergi ' + (form.fel === 'remorca' ? 'remorca' : 'semiremorca') + ' ' + form.plate + ' din flotă?\n\nVehiculele care o aveau ca „obișnuită" rămân fără ea.'}
          onCancel={() => setDel(false)} onOk={sterge} />
      )}
    </div>
  );
}
