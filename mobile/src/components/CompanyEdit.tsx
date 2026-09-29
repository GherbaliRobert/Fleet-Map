import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from './Icon';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { contacte, type Contact } from '../lib/companii';
import '../screens/admin.css';
import '../screens/detail.css';
import '../screens/firma.css';
import '../screens/companii.css';

// Foile fișei unei firme (fondatori): „Editează datele companiei" și „Module & limite".
// Aceleași câmpuri, texte și rute ca pe web (raxEditCompany / raxOpenCompanyConfig).

const nul = (v: any) => { const s = String(v == null ? '' : v).trim(); return s || null; };

// ─── Editarea datelor companiei ───────────────────────────────────────────────────────────────
// Toate câmpurile, ca pe web: datele juridice, contactul, persoanele de contact și „Companie activă".
// Serverul schimbă doar cheile trimise (db.updateCompany, din 23.09); aici se trimit toate, cu golul ca null.
export function CompanyEditSheet({ company, onClose, onSaved }: { company: any; onClose: () => void; onSaved: () => void }) {
  const c = company || {};
  const [f, setF] = useState<Record<string, string>>({
    name: c.name || '', cui: c.cui || '', reg_com: c.reg_com || '', address: c.address || '',
    contact_email: c.contact_email || '', phone: c.phone || '', iban: c.iban || '', bank_name: c.bank_name || '',
  });
  const [pers, setPers] = useState<Contact[]>(() => contacte(c.contacts));
  const [activ, setActiv] = useState(c.active !== false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  useInapoiInchide(true, () => { if (busy) return false; onClose(); return true; });
  const sf = (k: string, v: string) => setF((p) => ({ ...p, [k]: v }));
  const sp = (i: number, k: keyof Contact, v: string) => setPers((l) => l.map((p, j) => (j === i ? { ...p, [k]: v } : p)));

  async function salveaza() {
    const name = f.name.trim();
    if (name.length < 2) { setMsg('Nume prea scurt.'); return; }
    // Rândurile complet goale se aruncă, ca pe web.
    const persoane = pers.map((p) => ({ name: p.name.trim(), role: p.role.trim(), phone: p.phone.trim(), email: p.email.trim() }))
      .filter((p) => p.name || p.role || p.phone || p.email);
    setBusy(true); setMsg('');
    try {
      await Api.updateCompany(Number(c.id), {
        name, cui: nul(f.cui), reg_com: nul(f.reg_com), address: nul(f.address),
        contact_email: nul(f.contact_email), phone: nul(f.phone), iban: nul(f.iban), bank_name: nul(f.bank_name),
        contacts: persoane, active: activ,
      });
      showToast('Companie actualizată ✓');
      onSaved();
    } catch (e: any) { setMsg(e?.message || 'Eroare la salvare'); }
    finally { setBusy(false); }
  }

  const camp = (label: string, k: string, ph: string, type = 'text', mod?: string) => (
    <div class="fld"><label>{label}</label>
      <input type={type} inputMode={mod as any} value={f[k]} placeholder={ph} autocapitalize={type === 'email' ? 'none' : undefined}
        onInput={(e: any) => sf(k, e.target.value)} /></div>
  );
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) onClose(); }}>
      <div class="sheet" style="max-height:92vh">
        <div class="sheet-h"><b><Icon name="edit" size={17} color="var(--co-ok)" /> Editează datele companiei</b>
          <button class="h-btn" onClick={() => { if (!busy) onClose(); }} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body">
          <div class="frm">
            {camp('Nume companie', 'name', 'ex. Transport Alfa SRL')}
            <div class="frm-row">{camp('CUI / CIF', 'cui', 'ex. RO12345678')}{camp('Nr. Reg. Com.', 'reg_com', 'ex. J40/1234/2020')}</div>
            {camp('Adresă (sediu / facturare)', 'address', 'Str. ..., nr. ..., oraș, județ')}
            <div class="frm-row">{camp('Email contact', 'contact_email', 'contact@firma.ro', 'email')}{camp('Telefon', 'phone', '07xx xxx xxx', 'tel')}</div>
            {camp('IBAN', 'iban', 'ROxx xxxx xxxx xxxx xxxx xxxx')}
            {camp('Bancă', 'bank_name', 'ex. Banca Transilvania')}

            <div class="fm-sec" style="margin:4px 0 0">Persoane de contact</div>
            {pers.map((p, i) => (
              <div class="fm-card pad" style="margin:0">
                <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
                  <b style="flex:1;font-size:13px;color:var(--text-muted)">Persoana {i + 1}</b>
                  <button class="fm-btn rau" onClick={() => setPers((l) => l.filter((_, j) => j !== i))} aria-label="Șterge persoana"><Icon name="x" size={15} /></button>
                </div>
                <div class="frm">
                  <div class="frm-row">
                    <div class="fld"><label>Nume</label><input value={p.name} placeholder="Nume" onInput={(e: any) => sp(i, 'name', e.target.value)} /></div>
                    <div class="fld"><label>Rol / funcție</label><input value={p.role} placeholder="Rol / funcție" onInput={(e: any) => sp(i, 'role', e.target.value)} /></div>
                  </div>
                  <div class="frm-row">
                    <div class="fld"><label>Telefon</label><input type="tel" value={p.phone} placeholder="Telefon" onInput={(e: any) => sp(i, 'phone', e.target.value)} /></div>
                    <div class="fld"><label>Email</label><input type="email" autocapitalize="none" value={p.email} placeholder="Email" onInput={(e: any) => sp(i, 'email', e.target.value)} /></div>
                  </div>
                </div>
              </div>
            ))}
            <button class="fm-btn" onClick={() => setPers((l) => l.concat([{ name: '', role: '', phone: '', email: '' }]))}>
              <Icon name="plus" size={15} /> Adaugă persoană</button>

            <button class={'co-chk' + (activ ? ' on' : '')} onClick={() => setActiv(!activ)} role="checkbox" aria-checked={activ}>
              <span class="bx">{activ ? <Icon name="check" size={14} /> : null}</span>
              <span class="mid"><b>Companie activă</b></span>
            </button>

            {msg && <div class="co-msg rau">{msg}</div>}
            <button class="btn btn-primary" disabled={busy} onClick={salveaza}>{busy ? 'Se salvează…' : 'Salvează'}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Module & limite ─────────────────────────────────────────────────────────────────────────
// Oferta firmei (trimite la „Abonament & plăți"), cele 4 module, cei 6 agenți AI și limita AI veche.
// Numele agenților NU se scriu pe telefon: vin de la server (/api/agents). ⚠ Ruta aia arată agenții
// FIRMEI CONTULUI care întreabă, nu catalogul platformei: un super-admin rămas legat de o firmă (conturi
// promovate înainte de 13.09) primește doar agenții aprinși acolo. Ca un agent stins la noi să nu dispară
// din foaia clientului, lista = catalogul ∪ agenții scriși pe firma clientului ∪ implicitul ofertei ei;
// o cheie fără nume de la server se arată după cheie. (Cererea către server: catalogul întreg în
// /api/companies/:id/settings.)
type AgentRand = { key: string; name: string; desc: string };
function agentiDeAratat(catalog: AgentRand[] | null, cfg: any): AgentRand[] {
  const out: AgentRand[] = [];
  const vazut: Record<string, boolean> = {};
  const pune = (k: any, a?: AgentRand) => {
    const key = String(k || '');
    if (!key || vazut[key]) return;
    vazut[key] = true;
    out.push(a || { key, name: 'RA ' + key.charAt(0).toUpperCase() + key.slice(1), desc: '' });
  };
  (catalog || []).forEach((a) => pune(a.key, a));
  const scrisi = cfg && Array.isArray(cfg.enabled_agents) ? cfg.enabled_agents : [];
  const impliciti = cfg && Array.isArray(cfg.agenti_implicit) ? cfg.agenti_implicit : [];
  impliciti.concat(scrisi).forEach((k: any) => pune(k));
  return out;
}
const MODULE = [
  { key: 'agents', label: 'Agenți AI', sub: 'Master — permite rularea agenților AI de mai jos' },
  { key: 'ai_assistant', label: 'Asistent AI', sub: 'Chat AI + RA Insight în aplicație' },
  { key: 'etransport', label: 'e-Transport', sub: 'Modul ANAF e-Transport (coduri UIT)' },
  { key: 'tahograf', label: 'Tahograf', sub: 'Analiză fișiere tahograf (.ddd)' },
];
export function CompanyConfigSheet({ companyId, areFond, onClose, onChanged, onOferta }: {
  companyId: number; areFond: boolean; onClose: () => void; onChanged: () => void; onOferta: () => void;
}) {
  const [cfg, setCfg] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [catalog, setCatalog] = useState<AgentRand[] | null>(null);
  const [feats, setFeats] = useState<Record<string, boolean>>({});
  const [ags, setAgs] = useState<string[]>([]);
  const [lim, setLim] = useState('');
  const [busy, setBusy] = useState(false);
  useInapoiInchide(true, () => { onClose(); return true; });

  function citeste() {
    return Api.companySettingsOf(companyId).then((s: any) => {
      setCfg(s);
      setFeats(Object.assign({}, (s && s.features) || {}));
      // Starea de pornire = lista scrisă pe firmă; fără ea, implicitul ofertei (agenti_implicit).
      setAgs(Array.isArray(s && s.enabled_agents) ? s.enabled_agents.slice() : ((s && s.agenti_implicit) || []).slice());
      setLim(s && s.ai_monthly_limit != null ? String(s.ai_monthly_limit) : '');
    });
  }
  useEffect(() => {
    citeste().catch((e: any) => setErr(e?.message || 'Eroare la încărcare.'));
    Api.aiAgents().then((r) => setCatalog((r && r.agents) || [])).catch(() => setCatalog([]));
  }, [companyId]);

  async function modul(key: string) {
    const on = !feats[key], prev = feats;
    setFeats({ ...feats, [key]: on });
    try {
      const r: any = await Api.setCompanyFeatures(companyId, { [key]: on });
      if (r && r.features) setFeats(Object.assign({}, r.features));
      showToast('Modul ' + (on ? 'activat' : 'dezactivat'));
      // La comutatorul master se recitește lista de agenți: fără listă scrisă, implicitul se schimbă cu el.
      if (key === 'agents') citeste().catch(() => {});
      onChanged();
    } catch (e: any) { setFeats(prev); showToast(e?.message || 'Eroare', true); }
  }
  async function agent(key: string) {
    if (!feats.agents) return;
    const on = ags.indexOf(key) < 0, prev = ags;
    const arr = ags.filter((k) => k !== key).concat(on ? [key] : []);
    setAgs(arr);
    try { await Api.saveCompanySettingsOf(companyId, { enabled_agents: arr }); showToast('Agent ' + (on ? 'activat' : 'dezactivat')); }
    catch (e: any) { setAgs(prev); showToast(e?.message || 'Eroare', true); }
  }
  async function salveazaLimita() {
    const v = lim.trim();
    const l = v === '' ? null : Math.max(0, parseInt(v) || 0);
    setBusy(true);
    try { await Api.setCompanyAiLimit(companyId, l); showToast(l == null ? 'Limită AI: nelimitat' : 'Limită AI salvată'); onChanged(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }

  const agOff = !feats.agents;
  const lista = agentiDeAratat(catalog, cfg);
  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet" style="max-height:92vh">
        <div class="sheet-h"><b><Icon name="settings" size={17} color="var(--co-ok)" /> {cfg && cfg.name ? 'Configurare: ' + cfg.name : 'Configurare companie'}</b>
          <button class="h-btn" onClick={onClose} aria-label="Închide"><Icon name="x" /></button></div>
        <div class="sheet-body">
          {err && <div class="co-msg rau">{err}</div>}
          {!cfg && !err && <div class="spin" style="margin:16px auto" />}
          {cfg && (
            <>
              <div class="fm-sec" style="margin-top:4px">Oferta firmei</div>
              <button class="fm-btn acc" onClick={onOferta}><Icon name="coins" size={15} /> Vezi / schimbă oferta</button>
              <div class="co-note">Prețul și modulele vin din oferta semnată. Tot ce e mai jos le suprascrie, pe firma asta.</div>

              <div class="fm-sec">Module (acces funcții)</div>
              {MODULE.map((m) => (
                <button class="fm-tgl" onClick={() => modul(m.key)} role="switch" aria-checked={!!feats[m.key]}>
                  <span class="lbl">{m.label}<small>{m.sub}</small></span>
                  <span class={'sw' + (feats[m.key] ? ' on' : '')} />
                </button>
              ))}

              <div class="fm-sec">Agenți AI{agOff ? <span style="color:var(--co-warn);text-transform:none;letter-spacing:0;font-weight:700"> (modul oprit → niciunul nu rulează)</span> : null}</div>
              {catalog == null && <div class="spin" style="margin:8px auto" />}
              {catalog != null && lista.length === 0 && <div class="co-note">{agOff
                ? 'Pornește modulul „Agenți AI" de mai sus — apoi agenții apar aici.'
                : 'Lista agenților nu s-a putut încărca.'}</div>}
              {catalog != null && lista.map((a) => {
                const on = ags.indexOf(a.key) >= 0;
                return (
                  <button class="fm-tgl" disabled={agOff} style={agOff ? 'opacity:.55' : ''} onClick={() => agent(a.key)} role="switch" aria-checked={on}>
                    <span class="lbl">{a.name}{a.desc ? <small>{a.desc}</small> : null}</span>
                    <span class={'sw' + (on ? ' on' : '')} />
                  </button>
                );
              })}

              <div class="fm-sec">Limită AI lunară (cereri / prompturi)</div>
              <div style="display:flex;gap:8px;align-items:center">
                <input class="fm-in" style="flex:1" type="number" inputMode="numeric" min="0" step="10" value={lim}
                  placeholder="ex: 500 — gol = nelimitat" onInput={(e: any) => setLim(e.target.value)} />
                <button class="fm-btn acc" disabled={busy} onClick={salveazaLimita}><Icon name="check" size={15} /> Salvează</button>
              </div>
              <div class="co-note">{areFond
                ? 'Firma are fond RA Insight — limita asta nu se mai aplică.'
                : 'Număr maxim de cereri AI (prompturi) la 30 de zile. Întrebările rapide predefinite NU consumă din limită. Gol = nelimitat.'}</div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
