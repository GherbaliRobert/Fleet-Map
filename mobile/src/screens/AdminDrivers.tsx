// Șoferi — ca pe web (Management → Șoferi): pe rând, poza sau inițialele, încadrarea („Profesionist" /
// „Șofer"), cât mai are permisul („mai are 29 zile", „expirat de 43 zile", „fără permis în fișă"), mașina
// pe care e pus omul; căutare, contor și exportul „Situația șoferilor" (Excel / PDF, prin serverul care
// pune numele brandat și logo-ul) plus CSV-ul de lucru. Importul din fișier rămâne pe web (lucru de birou).
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { Cautare, Confirma } from '../components/FlotaUi';
import { VehicleArt, vehCatOf } from '../components/VehicleArt';
import { flota, numar, uitaFlota } from '../components/flotaCommon';
import { salveazaDeLaServer } from '../lib/export';
import './detail.css';
import './admin.css';
import './flota.css';
import { nrDe } from '../lib/numar';

type Lic = { st: 'none' | 'nodate' | 'exp' | 'soon' | 'ok'; num: string; days?: number; date?: string };
// Starea permisului, pe zile de calendar (un permis care expiră azi nu e „expirat" la ora 15:00).
function permis(d: any): Lic {
  const num = String(d.license_number || '').trim();
  if (!d.license_expiry) return { st: num ? 'nodate' : 'none', num };
  const e = new Date(d.license_expiry), now = new Date();
  const days = Math.round((Date.UTC(e.getFullYear(), e.getMonth(), e.getDate()) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
  return { st: days < 0 ? 'exp' : (days <= 30 ? 'soon' : 'ok'), num, days, date: e.toLocaleDateString('ro-RO') };
}
function cats(v: any): string[] { return String(v || '').split(',').map((s) => s.trim()).filter(Boolean); }
function areOricare(v: any, lista: string[] | undefined) { return Array.isArray(lista) && lista.length ? cats(v).some((c) => lista.indexOf(c) >= 0) : false; }
function initiale(n: string) { return String(n || '?').split(/\s+/).map((w) => w[0] || '').slice(0, 2).join('').toUpperCase() || '?'; }

// Poza: micșorată în pagină (max 400px, JPEG ~0.82), ca pe web — poză mică în bază, încărcare rapidă.
function micsoreazaPoza(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!/^image\//.test(file.type)) return reject(new Error('Alege un fișier imagine.'));
    const fr = new FileReader();
    fr.onload = () => {
      const img = new Image();
      img.onload = () => {
        const max = 400; let w = img.width, h = img.height;
        if (w > h && w > max) { h = Math.round(h * max / w); w = max; } else if (h >= w && h > max) { w = Math.round(w * max / h); h = max; }
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        c.getContext('2d')!.drawImage(img, 0, 0, w, h);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = () => reject(new Error('Imagine invalidă.'));
      img.src = String(fr.result);
    };
    fr.onerror = () => reject(new Error('Nu am putut citi poza.'));
    fr.readAsDataURL(file);
  });
}

export function AdminDrivers() {
  const loc = useLocation();
  const canWrite = !!me.value?.permissions?.manageFleet && !(me.value?.editariTaiate || []).includes('soferi');
  const isSuper = !!me.value?.isSuper;
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [devs, setDevs] = useState<any[]>([]);
  const [lic, setLic] = useState<any | null>(null);
  const [companies, setCompanies] = useState<{ value: string; label: string }[]>([]);
  const [fco, setFco] = useState('');
  const [q, setQ] = useState('');
  const [form, setForm] = useState<any | null>(null); // {} = nou; rândul = modificare
  const [f, setF] = useState<any>({});
  const [saving, setSaving] = useState(false);
  const [del, setDel] = useState<any | null>(null);
  const [exp, setExp] = useState('');

  async function reload() {
    setErr('');
    try { const r = await Api.drivers(); setList(Array.isArray(r) ? r : []); }
    catch (e: any) { setErr(e?.status === 403 ? 'Nu ai acces la șoferi.' : (e?.message || 'Eroare la încărcare')); setList([]); }
  }
  useEffect(() => {
    reload();
    flota().then(setDevs);
    // Categoriile de pe permis vin de la server (license_cats.js). Fără ele, bifele nu se desenează deloc —
    // mai bine lipsesc decât să inventăm aici o listă paralelă.
    Api.licenseCats().then(setLic).catch(() => setLic(null));
    if (isSuper) Api.companies().then((cs) => setCompanies((cs || []).map((c: any) => ({ value: String(c.id), label: c.name || ('#' + c.id) })))).catch(() => {});
  }, []);

  // Vehiculele pe care e pus șoferul (devices.driver_id).
  const vehiculeDe = (id: any) => devs.filter((d) => String(d.driver_id) === String(id));
  const k = q.trim().toLowerCase();
  let shown = list || [];
  if (fco) shown = shown.filter((d) => String(d.company_id) === fco);
  if (k) shown = shown.filter((d) => ((d.name || '') + ' ' + (d.phone || '') + ' ' + (d.email || '') + ' ' + (d.license_number || '')).toLowerCase().indexOf(k) >= 0);

  function deschide(d: any | null) {
    setF(d
      ? { name: d.name || '', phone: d.phone || '', email: d.email || '', license_number: d.license_number || '', license_expiry: d.license_expiry ? String(d.license_expiry).slice(0, 10) : '', license_categories: d.license_categories || '', photo_b64: d.photo_b64 || '', company_id: d.company_id != null ? String(d.company_id) : '' }
      : { name: '', phone: '', email: '', license_number: '', license_expiry: '', license_categories: '', photo_b64: '', company_id: fco || '' });
    setForm(d || {});
  }
  const set = (key: string, v: any) => setF((p: any) => ({ ...p, [key]: v }));

  async function salveaza() {
    if (!String(f.name || '').trim()) { showToast('Numele e obligatoriu', true); return; }
    const nou = !(form && form.id != null);
    const body: any = {
      name: f.name.trim(), phone: String(f.phone || '').trim(), email: String(f.email || '').trim(),
      license_number: String(f.license_number || '').trim(), license_expiry: f.license_expiry || null,
      license_categories: cats(f.license_categories).length ? cats(f.license_categories).join(',') : null,
      // Poza se trimite MEREU înapoi: serverul scrie ce primește, deci fără ea o corectură ar șterge-o.
      photo_b64: f.photo_b64 || null,
    };
    if (isSuper && nou) { if (!f.company_id) { showToast('Alege compania pentru noul șofer', true); return; } body.company_id = parseInt(f.company_id); }
    setSaving(true);
    try {
      if (nou) await Api.createDriver(body); else await Api.updateDriver(form.id, body);
      showToast(nou ? 'Adăugat' : 'Salvat'); setForm(null); await reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setSaving(false); }
  }
  async function sterge(d: any) {
    setSaving(true);
    try { await Api.deleteDriver(d.id); showToast('Șters'); setDel(null); setForm(null); uitaFlota(); await reload(); flota(true).then(setDevs); }
    catch (e: any) { showToast(e?.message || 'Eroare la ștergere', true); }
    finally { setSaving(false); }
  }
  // Exportul trece prin serverul care pune numele „RA-Track - Raport Situația șoferilor - data" și logo-ul.
  // Numele fișierului se ia din răspunsul serverului, nu se compune aici.
  async function exporta(fmt: 'csv' | 'xlsx' | 'pdf') {
    if (exp) return;
    setExp(fmt);
    try {
      const azi = new Date().toLocaleDateString('ro-RO');
      if (fmt === 'csv') await salveazaDeLaServer('/api/drivers/export.csv', 'soferi.csv');
      else await salveazaDeLaServer('/api/drivers/export?format=' + fmt, 'RA-Track - Raport Situația șoferilor - ' + azi + '.' + fmt);
    } catch (e: any) { showToast(e?.message || 'Exportul n-a mers', true); }
    finally { setExp(''); }
  }

  const proSet = new Set<string>((lic && lic.pro) || []);
  const selCats = cats(f.license_categories);
  const grupe: string[] = [];
  if (lic && Array.isArray(lic.categories)) for (const c of lic.categories) if (grupe.indexOf(c.group || '') < 0) grupe.push(c.group || '');
  const toggleCat = (code: string) => set('license_categories', (selCats.indexOf(code) >= 0 ? selCats.filter((c) => c !== code) : selCats.concat(code)).join(','));

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Șoferi</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        {isSuper && companies.length > 0 && (
          <div class="adm-filter">
            <select value={fco} onChange={(e) => setFco((e.target as HTMLSelectElement).value)}>
              <option value="">Toate companiile</option>
              {companies.map((o) => <option value={o.value}>{o.label}</option>)}
            </select>
          </div>
        )}
        <Cautare value={q} onInput={setQ} placeholder="Caută după nume, telefon, email sau permis…"
          count={list ? shown.length + (shown.length === 1 ? ' șofer' : ' șoferi') : ''} />
        <div style="display:flex;gap:6px;margin-bottom:12px">
          <button class="fl-ab" style="flex:1" disabled={!!exp} onClick={() => exporta('csv')}><Icon name="download" size={15} /> {exp === 'csv' ? '…' : 'CSV'}</button>
          <button class="fl-ab" style="flex:1" disabled={!!exp} onClick={() => exporta('xlsx')}><Icon name="download" size={15} /> {exp === 'xlsx' ? '…' : 'Excel'}</button>
          <button class="fl-ab" style="flex:1" disabled={!!exp} onClick={() => exporta('pdf')}><Icon name="download" size={15} /> {exp === 'pdf' ? '…' : 'PDF'}</button>
        </div>
        {err && <div class="fl-empty" style="color:var(--red)">{err}</div>}
        {list == null && !err && <div class="fl-empty"><div class="spin" style="margin:0 auto" /></div>}
        {list != null && !err && (shown.length ? (
          <div class="fl-list">
            {shown.map((d, i) => {
              const L = permis(d);
              const cs = cats(d.license_categories);
              const pro = cs.length ? (lic ? areOricare(d.license_categories, lic.pro) : null) : null;
              const tah = lic ? areOricare(d.license_categories, lic.tacho) : false;
              const vs = vehiculeDe(d.id);
              let pill;
              if (L.st === 'none' && !cs.length) pill = <span class="fl-pill s-none">fără permis în fișă</span>;
              else if (L.st === 'nodate' || L.st === 'none') pill = <span class="fl-pill s-none">fără dată de expirare</span>;
              else if (L.st === 'exp') pill = <span class="fl-pill s-over">expirat de {-(L.days || 0)} zile</span>;
              else if (L.st === 'soon') pill = <span class="fl-pill s-soon">{L.days === 0 ? 'expiră azi' : 'mai are ' + nrDe(L.days, 'zi', 'zile')}</span>;
              else pill = <span class="fl-pill s-done">până {L.date}</span>;
              const contact = [d.phone, d.email].filter(Boolean).join(' · ');
              return (
                <button class="fl-g" style="text-align:left;padding:11px 12px;font-family:inherit;color:var(--text-primary);width:100%"
                  onClick={() => canWrite ? deschide(d) : undefined}>
                  <div style="display:flex;gap:11px;align-items:flex-start">
                    {d.photo_b64 ? <img class="fl-av" src={d.photo_b64} alt="" /> : <span class={'fl-av c' + ((i % 5) + 1)}>{initiale(d.name)}</span>}
                    <div style="flex:1;min-width:0">
                      <div class="fl-rn">{d.name || '(fără nume)'}{pro != null && <span class={'fl-tag ' + (pro ? 'pro' : 'basic')}>{pro ? 'Profesionist' : 'Șofer'}</span>}</div>
                      {isSuper && d.company_name ? <div class="fl-rs">{d.company_name}</div> : null}
                      <div class="fl-rs">{contact || 'fără telefon'}</div>
                      {(L.num || cs.length) ? <div class="fl-rs"><Icon name="idCard" size={12} /> {L.num || '—'}{cs.length ? ' · ' + cs.join(' · ') : ''}</div> : null}
                      <div class="fl-rf" style="margin-top:6px">
                        {pill}
                        {tah && <span class="fl-pill s-blue">tahograf</span>}
                        {vs.length
                          ? <span class="fl-chip nx" style="min-height:28px"><VehicleArt cat={vehCatOf(vs[0])} color="currentColor" width={24} />{numar(devs, vs[0].imei)}{vs.length > 1 ? <span style="color:var(--text-muted)"> +{vs.length - 1}</span> : null}</span>
                          : <span class="fl-rs" style="margin:0">nealocat</span>}
                      </div>
                    </div>
                    {canWrite && <span style="color:var(--text-muted);display:flex;align-self:center"><Icon name="chevronR" size={18} /></span>}
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div class="fl-empty"><div class="ic"><Icon name="user" size={30} /></div>{k ? 'Niciun șofer care să se potrivească.' : (fco ? 'Niciun șofer în această companie.' : 'Niciun șofer.')}</div>
        ))}
      </div>

      {canWrite && <button class="fab" onClick={() => deschide(null)} aria-label="Adaugă șofer"><Icon name="plus" size={26} color="#06210f" /></button>}

      {form && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) setForm(null); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b style="min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap"><Icon name="user" size={18} color="var(--accent)" /> {form.id != null ? 'Editezi: ' + (form.name || '') : 'Adaugă șofer nou'}</b>
              <button class="h-btn" onClick={() => { if (!saving) setForm(null); }} aria-label="Închide"><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              <div class="frm">
                <div style="display:flex;align-items:center;gap:12px">
                  {f.photo_b64 ? <img class="fl-av" style="width:56px;height:56px;flex-basis:56px" src={f.photo_b64} alt="" /> : <span class="fl-av c5" style="width:56px;height:56px;flex-basis:56px">{initiale(f.name)}</span>}
                  <label class="fl-ab" style="flex:1">
                    <input type="file" accept="image/*" style="display:none" onChange={async (e) => {
                      const fl = (e.target as HTMLInputElement).files?.[0]; (e.target as HTMLInputElement).value = '';
                      if (!fl) return;
                      try { set('photo_b64', await micsoreazaPoza(fl)); } catch (er: any) { showToast(er?.message || 'Poza nu s-a putut citi', true); }
                    }} />
                    <Icon name="upload" size={15} /> {f.photo_b64 ? 'Schimbă poza' : 'Pune o poză'}
                  </label>
                  {f.photo_b64 && <button class="fl-ab dang" aria-label="Scoate poza" onClick={() => set('photo_b64', '')}><Icon name="trash" size={15} /></button>}
                </div>
                <div class="fld"><label>Nume complet <span class="req">*</span></label><input value={f.name} placeholder="Ex: Ion Popescu" onInput={(e) => set('name', (e.target as HTMLInputElement).value)} /></div>
                <div class="frm-row">
                  <div class="fld"><label>Telefon</label><input type="tel" inputMode="tel" value={f.phone} placeholder="07xx xxx xxx" onInput={(e) => set('phone', (e.target as HTMLInputElement).value)} /></div>
                  <div class="fld"><label>Email</label><input type="email" value={f.email} placeholder="nume@exemplu.ro" onInput={(e) => set('email', (e.target as HTMLInputElement).value)} /></div>
                </div>
                <div class="frm-row">
                  <div class="fld"><label>Nr. permis</label><input value={f.license_number} placeholder="Serie / număr" onInput={(e) => set('license_number', (e.target as HTMLInputElement).value)} /></div>
                  <div class="fld"><label>Expirare permis</label><input type="date" value={f.license_expiry} onInput={(e) => set('license_expiry', (e.target as HTMLInputElement).value)} /></div>
                </div>
                {lic && Array.isArray(lic.categories) && (
                  <div class="fld"><label>Categorii pe permis</label>
                    <div class="chips">
                      {grupe.map((g) => (
                        <div class="chips-g">
                          {g && <span class="chips-gt">{g}</span>}
                          <div class="chips-b">
                            {lic.categories.filter((c: any) => (c.group || '') === g).map((c: any) => (
                              <button type="button" title={c.label + (proSet.has(c.code) ? ' — categorie profesionistă' : '')}
                                class={'chip' + (selCats.indexOf(c.code) >= 0 ? ' on' : '') + (proSet.has(c.code) ? ' hi' : '')}
                                onClick={() => toggleCat(c.code)}>{c.code}</button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                    {/* Bifele decid încadrarea și dacă omul intră în scadențarul de tahograf — spus pe loc. */}
                    {selCats.length ? (
                      <div class="fld-note">
                        <span class={'adm-pill ' + (areOricare(f.license_categories, lic.pro) ? 'ok' : '')}>{areOricare(f.license_categories, lic.pro) ? 'Șofer profesionist' : 'Șofer'}</span>
                        {areOricare(f.license_categories, lic.tacho) && <span class="fl-pill s-blue">Card de tahograf — apare în Tahograf, de descărcat la 28 de zile</span>}
                      </div>
                    ) : <div class="fld-note" style="color:var(--text-muted)">Nebifat — fără încadrare. Categoriile se iau de pe permis, rubrica 9.</div>}
                  </div>
                )}
                {isSuper && form.id == null && (
                  <div class="fld"><label>Companie <span class="req">*</span></label>
                    <select value={f.company_id} onChange={(e) => set('company_id', (e.target as HTMLSelectElement).value)}>
                      <option value="">— alege compania —</option>
                      {companies.map((o) => <option value={o.value}>{o.label}</option>)}
                    </select>
                  </div>
                )}
                {form.id != null && vehiculeDe(form.id).length > 0 && (
                  <div class="fl-hint">Pus pe: {vehiculeDe(form.id).map((v) => numar(devs, v.imei)).join(', ')}. Mașina se schimbă din fișa vehiculului.</div>
                )}
                <div class="frm-actions">
                  {form.id != null && <button class="btn btn-danger-ghost" style="flex:0 0 auto" disabled={saving} onClick={() => setDel(form)} aria-label="Șterge"><Icon name="trash" size={16} /></button>}
                  <button class="btn btn-primary" disabled={saving} onClick={salveaza}>{saving ? 'Se salvează…' : (form.id != null ? 'Salvează' : 'Adaugă')}</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {del && (
        <Confirma title="Confirmare ștergere" okLabel="Șterge" danger busy={saving}
          text={'Ștergi șoferul „' + (del.name || '') + '”?' + (vehiculeDe(del.id).length ? '\n\nMașinile pe care e pus rămân fără șofer.' : '')}
          onCancel={() => setDel(null)} onOk={() => sterge(del)} />
      )}
    </div>
  );
}
