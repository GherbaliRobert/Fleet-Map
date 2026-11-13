import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from './Icon';
import { useInapoiInchide } from '../lib/inapoiFoaie';
import { contacte, type Contact, MODULE_FIRMA, MOD_ALES, MOD_INAPOI, modulAutoText } from '../lib/companii';
import { NOTA_PACHET_FIRMA, acumPachetFirma, butonPachetFirma } from '../lib/insightPachet';
import { Confirma } from './FlotaUi';
import { Gros } from './InsightText';
import '../screens/admin.css';
import '../screens/detail.css';
import '../screens/firma.css';
import '../screens/companii.css';

// Fișa unei firme (fondatori): foaia „Editează datele companiei" și fila „Acces" (până pe 12.10, foaia „Module & limite").
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
// Oferta firmei (trimite la „Abonament & plăți"), pachetul RA Insight, cele 4 module și cei 6 agenți AI.
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
// ─── Fila „Acces" a fișei firmei (12.10): pachetul RA Insight, modulele și agenții AI ───────────────────────────────────────
// Până pe 12.10 era foaia „Module & limite"; acum e o filă a fișei, ca pe web (fila „Acces", _raxRenderCfg). Modulele
// vin din lib/companii (MODULE_FIRMA, legate de web prin verify_firma_stare.js), iar „automat / ales de noi" din ce
// spune serverul (features_setate, dupa_flota, flota_grea) — telefonul nu socotește flota a doua oară.
export function CompanyAcces({ companyId, onChanged, onOferta }: {
  companyId: number; onChanged: () => void; onOferta: () => void;
}) {
  const [cfg, setCfg] = useState<any | null>(null);
  const [err, setErr] = useState('');
  const [catalog, setCatalog] = useState<AgentRand[] | null>(null);
  const [feats, setFeats] = useState<Record<string, boolean>>({});
  const [setate, setSetate] = useState<Record<string, boolean>>({});
  const [flotaGrea, setFlotaGrea] = useState(false);
  const [ags, setAgs] = useState<string[]>([]);
  const [pkAles, setPkAles] = useState<any | null>(null);   // { p: pachetul ales, t: textul ferestrei, de la server }
  useInapoiInchide(!!pkAles, () => { setPkAles(null); return true; });

  // Răspunsul serverului e adevărul: comutatoarele și „automat / ales de noi".
  function dupaRaspuns(r: any) {
    if (r && r.features) setFeats(Object.assign({}, r.features));
    if (r && r.features_setate) setSetate(Object.assign({}, r.features_setate));
    if (r && r.flota_grea !== undefined) setFlotaGrea(!!r.flota_grea);
  }
  function citeste() {
    return Api.companySettingsOf(companyId).then((s: any) => {
      setCfg(s);
      dupaRaspuns(s);
      // Starea de pornire = lista scrisă pe firmă; fără ea, implicitul ofertei (agenti_implicit).
      setAgs(Array.isArray(s && s.enabled_agents) ? s.enabled_agents.slice() : ((s && s.agenti_implicit) || []).slice());
    });
  }
  useEffect(() => {
    setCfg(null); setErr('');
    citeste().catch((e: any) => setErr(e?.message || 'Eroare la încărcare.'));
    Api.aiAgents().then((r) => setCatalog((r && r.agents) || [])).catch(() => setCatalog([]));
  }, [companyId]);

  async function modul(key: string) {
    const on = !feats[key], prev = feats;
    setFeats({ ...feats, [key]: on });
    try {
      const r: any = await Api.setCompanyFeatures(companyId, { [key]: on });
      dupaRaspuns(r);
      showToast('Modul ' + (on ? 'activat' : 'dezactivat'));
      // La comutatorul master se recitește lista de agenți: fără listă scrisă, implicitul se schimbă cu el.
      if (key === 'agents') citeste().catch(() => {});
      onChanged();
    } catch (e: any) { setFeats(prev); showToast(e?.message || 'Eroare', true); }
  }
  // „Înapoi la automat": cheia iese din setările firmei, iar modulul merge iar după flotă (ca pe web: raxCfgAutomat).
  async function automat(key: string) {
    try {
      const r: any = await Api.setCompanyFeatures(companyId, { [key]: null });
      dupaRaspuns(r);
      showToast('Merge din nou după flotă');
      onChanged();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
  }
  async function agent(key: string) {
    if (!feats.agents) return;
    const on = ags.indexOf(key) < 0, prev = ags;
    const arr = ags.filter((k) => k !== key).concat(on ? [key] : []);
    setAgs(arr);
    try { await Api.saveCompanySettingsOf(companyId, { enabled_agents: arr }); showToast('Agent ' + (on ? 'activat' : 'dezactivat')); }
    catch (e: any) { setAgs(prev); showToast(e?.message || 'Eroare', true); }
  }
  // Pachetul RA Insight al firmei (web: raxCfgPachet). Textul ferestrei îl scrie serverul (13.11): de azi și rândurile RA Insight de pe
  // factura din 1 a lunii următoare. La salvare pleacă și textul confirmat; la 409 vine textul nou, de confirmat din nou.
  async function alegePachet(p: any) {
    try { const t: any = await Api.pachetSchimbare(companyId, p.cod); setPkAles({ p, t }); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); }
  }
  async function punePachet() {
    const c = pkAles; if (!c) return;
    setPkAles(null);
    try {
      const j: any = await Api.saveCompanySettingsOf(companyId, { ai_pachet: { cod: c.p.cod }, textSchimbare: c.t.text });
      const a = j && j.ai_pachet;
      setCfg((x: any) => Object.assign({}, x, { ai_pachet: a ? { cod: a.cod, nume: c.p.nume, pretRON: a.pretRON, deLa: a.de_la } : null }));
      showToast('Pachet RA Insight ' + c.p.nume);
      onChanged();
    } catch (e: any) {
      if (e && e.status === 409 && e.data && e.data.schimbare) { setPkAles({ p: c.p, t: e.data.schimbare }); return; }
      showToast(e?.message || 'Eroare', true);
    }
  }

  const agOff = !feats.agents;
  const lista = agentiDeAratat(catalog, cfg);
  const dupaFlota: string[] = (cfg && Array.isArray(cfg.dupa_flota)) ? cfg.dupa_flota : [];
  const ales = (k: string) => Object.prototype.hasOwnProperty.call(setate, k);
  return (
    <>
      {err && <div class="co-msg rau">{err}</div>}
      {!cfg && !err && <div class="spin" style="margin:16px auto" />}
      {cfg && (
        <div class="fm-card pad">
          <div class="fm-sec" style="margin-top:0">Oferta firmei</div>
          <button class="fm-btn acc" onClick={onOferta}><Icon name="coins" size={15} /> Vezi / schimbă oferta</button>
          <div class="co-note">Prețul și modulele vin din oferta semnată. Tot ce e mai jos le suprascrie, pe firma asta.</div>

          {/* Pachetul RA Insight: îl punem noi, de aici. Lista, prețurile de listă și pachetul firmei vin de la server. */}
          {Array.isArray(cfg.pachete) && <>
            <div class="fm-sec">Pachet RA Insight</div>
            <div class="co-pk">
              {cfg.pachete.map((p: any) => {
                const al = !!(cfg.ai_pachet && cfg.ai_pachet.cod === p.cod);
                return <button class={'fm-btn' + (al ? ' acc' : '')} aria-pressed={al ? 'true' : undefined} onClick={() => { if (!al) alegePachet(p); }}>{butonPachetFirma(p)}</button>;
              })}
            </div>
            <div class="co-note"><Gros text={acumPachetFirma(cfg)} /> {NOTA_PACHET_FIRMA}</div>
          </>}

          <div class="fm-sec">Module (acces funcții)</div>
          {MODULE_FIRMA.map((m) => (
            <>
              <button class="fm-tgl" onClick={() => modul(m.key)} role="switch" aria-checked={!!feats[m.key]}>
                <span class="lbl">{m.label}<small>{m.sub}</small>
                  {dupaFlota.indexOf(m.key) >= 0 && (ales(m.key)
                    ? <small style="color:var(--co-warn);font-weight:800">{MOD_ALES}</small>
                    : <small style="color:var(--co-ok);font-weight:800">{modulAutoText(flotaGrea)}</small>)}
                </span>
                <span class={'sw' + (feats[m.key] ? ' on' : '')} />
              </button>
              {dupaFlota.indexOf(m.key) >= 0 && ales(m.key) && (
                <button class="fm-btn" style="margin:2px 0 8px" onClick={() => automat(m.key)}>{MOD_INAPOI}</button>
              )}
            </>
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

        </div>
      )}
      {pkAles && (
        <Confirma title={pkAles.t.titlu} text={pkAles.t.text} okLabel={pkAles.t.ok} onCancel={() => setPkAles(null)} onOk={() => punePachet()} />
      )}
    </>
  );
}
