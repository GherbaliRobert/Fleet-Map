import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast, theme } from '../app/store';
import { Icon } from '../components/Icon';
import './admin.css';
import './detail.css'; // .sheet*, .btn*

// Super-admin: lista TUTUROR dispozitivelor (toate companiile + neasignate + arhivate) → mutare companie + interfață CAN.
// Toate apelurile sunt requireSuperadmin pe server → un non-super primește 403 (ecranul oricum e ascuns din meniu).
const CAN_OPTS = [
  { value: '', label: 'Auto (implicit)' },
  { value: 'fms', label: 'FMS (camioane / tahograf)' },
  { value: 'lvcan', label: 'LV-CAN200 (Dacia / autoturisme)' },
  { value: 'tacho', label: 'Tahograf' },
];
// Semnalul aparatului — ACELEAȘI praguri și cuvinte ca pe web (coloana „Semnal" din Dispozitive, luată din
// „Aparate GPS"): sub 30 de minute „comunică", sub 24 de ore „tăcut de …", peste „fără semnal de …".
// Un aparat mut înseamnă un client care plătește și nu primește nimic — aici se vede fără să faci socoteli.
const TACUT_MIN = 30, MUT_ORE = 24;
function deCand(ms: number): string {
  const m = Math.floor(ms / 60000);
  if (m < 1) return 'câteva secunde';
  if (m < 60) return m + ' min';
  const h = Math.floor(m / 60);
  if (h < 24) return h + (h === 1 ? ' oră' : ' ore');
  const z = Math.floor(h / 24);
  return z + (z === 1 ? ' zi' : ' zile');
}
// Momentul vine uneori ca număr (epoch ms), alteori ca text ISO — le recunoaștem pe amândouă.
function momentMs(v: any): number {
  if (v == null || v === '') return NaN;
  const s = String(v).trim();
  return /^\d+$/.test(s) ? Number(s) : new Date(s).getTime();
}
function semnal(lastTx: any): { t: string; c: string } {
  if (lastTx == null || lastTx === '') return { t: 'nicio transmisie', c: 'var(--red)' };
  const ts = momentMs(lastTx);
  if (!isFinite(ts)) return { t: '—', c: 'var(--text-muted)' }; // mai bine nimic decât o stare inventată
  const d = Math.max(0, Date.now() - ts); // ceasul aparatului o poate lua înainte; nu inventăm viitor
  // Verdele aplicației (#3FE07D) nu e redefinit pe tema luminoasă: pe alb se citește greu, deci aici e mai închis.
  if (d < TACUT_MIN * 60000) return { t: 'comunică', c: theme.value === 'light' ? '#0E7A3C' : 'var(--accent)' };
  if (d < MUT_ORE * 3600000) return { t: 'tăcut de ' + deCand(d), c: 'var(--orange)' };
  return { t: 'fără semnal de ' + deCand(d), c: 'var(--red)' };
}
function dataOra(v: any): string { const t = momentMs(v); return isFinite(t) ? new Date(t).toLocaleString('ro-RO') : '—'; }
// Aparatul arhivat e oprit de noi: nu primește date, nu se mută între firme (se restaurează întâi).
const arhivat = (d: any) => !!d && d.status === 'archived';
// Ordinea de pe web: întâi cele care așteaptă o firmă, apoi cele active, arhivatele la urmă.
const ordine = (d: any) => (arhivat(d) ? 2 : d.company_id == null ? 0 : 1);

const TYPE_OPTS = [
  { value: '', label: '— auto —' },
  { value: 'car', label: 'Autoturism' },
  { value: 'van', label: 'Autoutilitară' },
  { value: 'truck', label: 'Camion' },
  { value: 'bus', label: 'Autobuz' },
];

export function AdminDevices() {
  const loc = useLocation();
  const [items, setItems] = useState<any[] | null>(null);
  const [companies, setCompanies] = useState<{ value: string; label: string }[]>([]);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [sel, setSel] = useState<any | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [canIface, setCanIface] = useState('');
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const GOL = { imei: '', name: '', plate: '', company_id: '', vehicle_type: '', can_interface: '', gps_model: '', sim_number: '', issue: false, issue_note: '' };
  const [f, setF] = useState<any>(GOL);
  const [issueNote, setIssueNote] = useState('');

  function reload() {
    setErr('');
    Promise.all([Api.adminDevices().catch(() => [] as any[]), Api.unassignedDevices().catch(() => [] as any[])])
      .then(([all, un]) => {
        const seen = new Set((all || []).map((d: any) => d.imei));
        const toate = (all || []).concat((un || []).filter((d: any) => !seen.has(d.imei)));
        setItems(toate.map((d: any, i: number) => [d, i] as [any, number])
          .sort((a, b) => ordine(a[0]) - ordine(b[0]) || a[1] - b[1]).map((x) => x[0]));
      })
      .catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setItems([]); });
    // Fără firma DEMO: acolo trăiesc conturile temporare ale străinilor care au cerut demo. Un aparat real
    // mutat acolo ar ieși din flota reală și ar ajunge sub ochii lor (ca pe web, unde lista o exclude).
    Api.companies().then((cs) => setCompanies((cs || []).filter((c: any) => !c.is_demo)
      .map((c: any) => ({ value: String(c.id), label: c.name || ('#' + c.id) })))).catch(() => {});
  }
  useEffect(reload, []);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    const list = items || [];
    if (!t) return list.slice(0, 300);
    return list.filter((d: any) => [d.imei, d.name, d.plate, d.company_name].some((x: any) => String(x || '').toLowerCase().includes(t))).slice(0, 300);
  }, [items, q]);

  function open(d: any) { setSel(d); setCompanyId(d.company_id != null ? String(d.company_id) : ''); setCanIface(d.can_interface || ''); setIssueNote(''); }

  // Semnalare / anulare „problemă la montaj" (reversibilă) — direct din sheet-ul dispozitivului
  async function toggleIssue(flagged: boolean) {
    if (!sel) return;
    setSaving(true);
    try {
      const r: any = await Api.setInstallIssue(sel.imei, flagged, flagged ? (issueNote.trim() || null) : null);
      setSel({ ...sel, install_issue: r?.install_issue || null });
      setIssueNote('');
      showToast(flagged ? 'Problemă la montaj semnalată' : 'Semnalare anulată');
      reload();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); }
  }

  async function save() {
    if (!sel) return;
    setSaving(true);
    try {
      const newCo = companyId === '' ? null : Number(companyId);
      if ((sel.company_id ?? null) !== newCo) await Api.moveDevice(sel.imei, newCo);
      if ((sel.can_interface || '') !== canIface) await Api.setCanInterface(sel.imei, canIface || null);
      showToast('Salvat'); setSel(null); reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); } finally { setSaving(false); }
  }

  // ── Adăugare manuală (super): pre-înregistrează IMEI → allow-list (mod strict). Util până la FOTA WEB (Teltonika). ──
  function openAdd() { setF(GOL); setAdding(true); }
  const setFF = (k: string, v: any) => setF((p: any) => ({ ...p, [k]: v }));
  async function submitAdd() {
    const imei = String(f.imei || '').trim();
    if (!/^\d{10,20}$/.test(imei)) { showToast('IMEI invalid — 10–20 de cifre', true); return; }
    setSaving(true);
    try {
      const body: any = { imei };
      if (f.name.trim()) body.name = f.name.trim();
      if (f.plate.trim()) body.plate = f.plate.trim();
      if (f.vehicle_type) body.vehicle_type = f.vehicle_type;
      if (f.company_id) body.company_id = Number(f.company_id);
      // Modelul și cartela sunt datele APARATULUI — singurele pe care le știi sigur când îl ai în mână.
      if (f.gps_model.trim()) body.gps_model = f.gps_model.trim();
      if (f.sim_number.trim()) body.sim_number = f.sim_number.trim();
      if (f.issue) { body.install_issue = true; if (f.issue_note.trim()) body.install_issue_note = f.issue_note.trim(); }
      await Api.createDevice(body);
      if (f.can_interface) await Api.setCanInterface(imei, f.can_interface);
      showToast('Dispozitiv adăugat'); setAdding(false); reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la adăugare', true); } finally { setSaving(false); }
  }

  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Dispozitive</div>
        <button class="h-btn" onClick={openAdd} aria-label="Adaugă dispozitiv"><Icon name="plus" /></button>
      </header>
      <div class="content has-tabbar" style="padding-bottom:24px">
        <div class="adm-filter"><input value={q} onInput={(e: any) => setQ(e.target.value)} placeholder="Caută IMEI / nume / număr / companie…" /></div>
        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && shown.length === 0 && !err && <div class="adm-empty"><Icon name="cpu" size={40} class="ic" /><div>Niciun dispozitiv.</div></div>}
        {items != null && shown.length > 0 && (
          <div class="adm-list">
            {shown.map((d: any) => (
              <button class="adm-item" onClick={() => open(d)}>
                <span class="ic-wrap"><Icon name="cpu" size={19} /></span>
                <span class="mid">
                  <div class="nm">{d.name || d.imei}{d.plate ? ' · ' + d.plate : ''}</div>
                  <div class="sub">{(d.company_name || (arhivat(d) ? 'Fără firmă' : 'Neasignat')) + ' · ' + (d.can_interface ? String(d.can_interface).toUpperCase() : 'auto') + ' · ' + d.imei}</div>
                  {/* Semnalul nu se arată la arhivate: pe alea le-am oprit noi, tăcerea lor e normală. */}
                  {!arhivat(d) && (() => { const sg = semnal(d.last_position_time || d.last_seen); return <div class="sub" style={'font-weight:700;color:' + sg.c}>● {sg.t}</div>; })()}
                </span>
                <span class="rt">
                  {d.install_issue && <span class="adm-pill warn">⚠ montaj</span>}
                  {arhivat(d) ? <span class="adm-pill">arhivat</span> : d.company_id == null && <span class="adm-pill warn">neasignat</span>}
                  <Icon name="chevronR" size={18} color="var(--text-muted)" />
                </span>
              </button>
            ))}
          </div>
        )}
      </div>

      {sel && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !saving) setSel(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="cpu" size={18} color="var(--accent)" /> {sel.name || sel.imei}</b><button class="h-btn" onClick={() => setSel(null)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                {!arhivat(sel) && (() => {
                  const sg = semnal(sel.last_position_time || sel.last_seen);
                  return <div style="font-size:13px"><b style={'color:' + sg.c}>● {sg.t}</b><span style="color:var(--text-muted)"> · ultima poziție {dataOra(sel.last_position_time || sel.last_seen)}</span></div>;
                })()}
                {arhivat(sel) ? (
                  <div class="fld"><label>Companie</label>
                    <div style="font-size:13px;line-height:1.5;color:var(--text-muted)">{sel.company_name || 'Fără firmă'} · Aparat arhivat — îl restaurezi din Dispozitive arhivate.</div>
                    <button class="adm-act" style="align-self:flex-start" onClick={() => loc.route('/admin/archived')}><Icon name="trash" size={14} /> Deschide Dispozitive arhivate</button>
                  </div>
                ) : (
                  <div class="fld"><label>Companie</label>
                    <select value={companyId} onChange={(e: any) => setCompanyId(e.target.value)}>
                      <option value="">— Neasignat —</option>
                      {companies.map((c) => <option value={c.value}>{c.label}</option>)}
                    </select>
                  </div>
                )}
                <div class="fld"><label>Interfață CAN</label>
                  <select value={canIface} onChange={(e: any) => setCanIface(e.target.value)}>
                    {CAN_OPTS.map((o) => <option value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Problemă la montaj</label>
                  {sel.install_issue ? (
                    <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
                      <span class="adm-pill warn" style="flex:1;min-width:140px">⚠ {sel.install_issue.note || 'semnalată'}{sel.install_issue.at ? ' · ' + new Date(Number(sel.install_issue.at)).toLocaleDateString('ro-RO') : ''}</span>
                      <button class="adm-act" disabled={saving} onClick={() => toggleIssue(false)}>Anulează semnalarea</button>
                    </div>
                  ) : (
                    <div style="display:flex;align-items:center;gap:8px">
                      <input style="flex:1" value={issueNote} placeholder="detalii (opțional)" onInput={(e: any) => setIssueNote(e.target.value)} />
                      <button class="adm-act" disabled={saving} onClick={() => toggleIssue(true)} style="color:#f59e0b">⚠ Semnalează</button>
                    </div>
                  )}
                </div>
                <div class="frm-actions"><button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : 'Salvează'}</button></div>
              </div>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !saving) setAdding(false); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="plus" size={18} color="var(--accent)" /> Adaugă dispozitiv</b><button class="h-btn" onClick={() => setAdding(false)}><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div style="font-size:12px;color:var(--text-muted);margin-bottom:4px">Înregistrează un tracker nou după IMEI. Intră în allow-list (mod strict) și e acceptat la următoarea conectare.</div>
                <div class="fld"><label>IMEI *</label><input value={f.imei} inputMode="numeric" maxLength={20} placeholder="ex. 862129084852924" onInput={(e: any) => setFF('imei', e.target.value)} /></div>
                <div class="fld"><label>Vehicul (nume)</label><input value={f.name} placeholder="ex. Dacia Logan 3" onInput={(e: any) => setFF('name', e.target.value)} /></div>
                <div class="fld"><label>Nr. înmatriculare</label><input value={f.plate} placeholder="ex. B 154 UIP" onInput={(e: any) => setFF('plate', e.target.value)} /></div>
                <div class="fld"><label>Companie</label>
                  <select value={f.company_id} onChange={(e: any) => setFF('company_id', e.target.value)}>
                    <option value="">— Neasignat —</option>
                    {companies.map((c) => <option value={c.value}>{c.label}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Tip vehicul</label>
                  <select value={f.vehicle_type} onChange={(e: any) => setFF('vehicle_type', e.target.value)}>
                    {TYPE_OPTS.map((o) => <option value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Interfață CAN</label>
                  <select value={f.can_interface} onChange={(e: any) => setFF('can_interface', e.target.value)}>
                    {CAN_OPTS.map((o) => <option value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div class="fld"><label>Model aparat GPS</label><input value={f.gps_model} placeholder="ex. Teltonika FMC130" onInput={(e: any) => setFF('gps_model', e.target.value)} /></div>
                <div class="fld"><label>Cartelă SIM</label><input value={f.sim_number} inputMode="tel" placeholder="ex. 0740111222" onInput={(e: any) => setFF('sim_number', e.target.value)} /></div>
                <label style="display:flex;align-items:center;gap:8px;font-size:13.5px;margin:4px 0;cursor:pointer">
                  <input type="checkbox" checked={f.issue} onChange={(e: any) => setFF('issue', e.target.checked)} />
                  <b style="color:#f59e0b">⚠ Problemă la montaj</b> <span style="font-size:11.5px;color:var(--text-muted)">(se poate anula ulterior)</span>
                </label>
                {f.issue && <div class="fld"><input value={f.issue_note} placeholder="detalii (opțional) — ex. cablaj de refăcut" onInput={(e: any) => setFF('issue_note', e.target.value)} /></div>}
                <div class="frm-actions"><button class="btn btn-primary" disabled={saving} onClick={submitAdd}>{saving ? 'Se adaugă…' : 'Adaugă dispozitiv'}</button></div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
