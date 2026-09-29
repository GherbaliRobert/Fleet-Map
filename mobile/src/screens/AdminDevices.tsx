import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { raCauta } from '../lib/format';
import { stareAparat, momentMs, type StareAparat } from '../lib/semnal';
import { AntetFondator, Banda, GrupFirma, adresaFirmei } from '../components/FondatorUi';
import './admin.css';
import './detail.css'; // .sheet*, .btn*
import './fondator.css';

// Super-admin: „Dispozitive" — ca pe web (raxRenderDevices): aparatele STAU PE FIRME. Întâi „Neasignate" (mereu
// deschis), apoi fiecare firmă, alfabetic, la final „Arhivate" (închis). Pastile cu număr, banda de adopție, modul
// strict cu aparatele neînregistrate care bat la ușă, iar din fișa aparatului: firma, interfața CAN, montajul,
// „Arhivează" / „Respinge". Toate apelurile sunt requireSuperadmin pe server (ruta e păzită și în App.tsx).
const CAN_OPTS = [
  { value: '', label: 'Auto (implicit)' },
  { value: 'fms', label: 'FMS (camioane / tahograf)' },
  { value: 'lvcan', label: 'LV-CAN200 (Dacia / autoturisme)' },
  { value: 'tacho', label: 'Tahograf' },
];
const TYPE_OPTS = [
  { value: '', label: '— auto —' },
  { value: 'car', label: 'Autoturism' },
  { value: 'van', label: 'Autoutilitară' },
  { value: 'truck', label: 'Camion' },
  { value: 'bus', label: 'Autobuz' },
];

// Semnalul: cuvintele și pragurile NU se scriu aici — vin din lib/semnal.ts, aceleași ca „Aparate GPS" și ca
// agpsStare de pe web (30 min → tăcut, 24 h → fără semnal). Doar culoarea: pe tema luminoasă, scrisul mic verde
// sau portocaliu se citește greu, deci folosim nuanțele mai închise din fondator.css.
const semnal = (d: any): StareAparat => stareAparat(d.last_position_time || d.last_seen);
const culoare = (s: StareAparat) => (s.k === 'ok' ? 'var(--fd-ok)' : s.k === 'tacut' ? 'var(--fd-warn)' : 'var(--fd-bad)');
function dataOra(v: any): string { const t = momentMs(v); return isFinite(t) ? new Date(t).toLocaleString('ro-RO') : '—'; }

type Galeata = 'archived' | 'unassigned' | 'active';
const galeata = (d: any): Galeata => (d.status === 'archived' ? 'archived' : d.company_id == null ? 'unassigned' : 'active');
const arhivat = (d: any) => !!d && galeata(d) === 'archived';
// Ce e de rezolvat la un aparat: fără semnal, n-a transmis niciodată, sau problemă la montaj. Arhivatele tac din voia noastră.
const deRezolvat = (d: any) => { if (arhivat(d)) return false; const s = semnal(d); return s.k === 'mut' || s.k === 'niciodata' || !!d.install_issue; };

type Filtru = 'all' | 'unassigned' | 'active' | 'nosignal' | 'archived';
// `?filtru=neasignate` — banda de pe Companii trimite direct aici (ca raxDevDeschideNeasignate pe web).
const DIN_ADRESA: Record<string, Filtru> = { neasignate: 'unassigned', active: 'active', 'fara-semnal': 'nosignal', arhivate: 'archived', toate: 'all' };
// Câte rânduri desenează un grup deschis înainte de „și încă N". Grupurile închise nu desenează nimic.
const PAS = 150;

type Grup = { k: string; nume: string; coId: number | null; dev: any[] };
function grupuri(rows: any[]): Grup[] {
  const g: Record<string, Grup> = {};
  rows.forEach((d) => {
    const b = galeata(d);
    const k = b === 'archived' ? '_arh' : b === 'unassigned' ? '_neas' : 'co' + d.company_id;
    if (!g[k]) g[k] = { k, coId: k.charAt(0) === 'c' ? d.company_id : null, dev: [], nume: k === '_arh' ? 'Arhivate' : k === '_neas' ? 'Neasignate' : (d.company_name || 'Firma #' + d.company_id) };
    g[k].dev.push(d);
  });
  const firme = Object.keys(g).filter((k) => k !== '_neas' && k !== '_arh').map((k) => g[k]).sort((a, b) => a.nume.localeCompare(b.nume, 'ro'));
  return (g._neas ? [g._neas] : []).concat(firme, g._arh ? [g._arh] : []);
}
const nApar = (n: number) => n + (n === 1 ? ' aparat' : ' aparate');

export function AdminDevices() {
  const loc = useLocation();
  const [items, setItems] = useState<any[] | null>(null);
  const [companies, setCompanies] = useState<{ value: string; label: string }[]>([]);
  const [strict, setStrict] = useState<boolean | null>(null);
  const [attempts, setAttempts] = useState<any[]>([]);
  const [err, setErr] = useState('');
  const [q, setQ] = useState('');
  const [filtru, setFiltru] = useState<Filtru>(() => DIN_ADRESA[String(((loc.query || {}) as any).filtru || '')] || 'all');
  // Deschis / închis ales de mână, pe grup. Ce n-a atins omul urmează regula de mai jos.
  const [manual, setManual] = useState<Record<string, boolean>>({});
  const [cate, setCate] = useState<Record<string, number>>({});
  const [sel, setSel] = useState<any | null>(null);
  const [companyId, setCompanyId] = useState('');
  const [canIface, setCanIface] = useState('');
  const [saving, setSaving] = useState(false);
  const [busyImei, setBusyImei] = useState('');
  const [adding, setAdding] = useState(false);
  const GOL = { imei: '', name: '', plate: '', company_id: '', vehicle_type: '', can_interface: '', gps_model: '', sim_number: '', issue: false, issue_note: '' };
  const [f, setF] = useState<any>(GOL);
  const [issueNote, setIssueNote] = useState('');

  function reload() {
    setErr('');
    Promise.all([Api.adminDevices(), Api.unassignedDevices().catch(() => [] as any[])])
      .then(([all, un]) => {
        const seen = new Set((all || []).map((d: any) => d.imei));
        setItems((all || []).concat((un || []).filter((d: any) => !seen.has(d.imei))));
      })
      .catch((e: any) => { setErr(e?.status === 403 ? 'Acces interzis.' : (e?.message || 'Eroare la încărcare')); setItems([]); });
    // Fără firma DEMO: acolo trăiesc conturile temporare ale străinilor care au cerut demo. Un aparat real
    // mutat acolo ar ieși din flota reală și ar ajunge sub ochii lor (ca pe web, unde lista o exclude).
    Api.companies().then((cs) => setCompanies((cs || []).filter((c: any) => !c.is_demo)
      .map((c: any) => ({ value: String(c.id), label: c.name || ('#' + c.id) })))).catch(() => {});
    Api.deviceAttempts().then((r) => { setStrict(!!(r && r.strict)); setAttempts(Array.isArray(r && r.attempts) ? r.attempts : []); })
      .catch(() => { setStrict(null); setAttempts([]); });
  }
  useEffect(reload, []);

  const toate = items || [];
  const counts = useMemo(() => {
    const c = { all: toate.length, unassigned: 0, active: 0, archived: 0, nosignal: 0 };
    toate.forEach((d) => { const b = galeata(d); c[b]++; if (b !== 'archived' && semnal(d).k === 'mut') c.nosignal++; });
    return c;
  }, [items]);

  // Filtrul + căutarea, apoi ordinea de pe web: ultima poziție, cea mai nouă prima.
  const rows = useMemo(() => toate.filter((d) => {
    if (filtru === 'nosignal') { if (arhivat(d) || semnal(d).k !== 'mut') return false; }
    else if (filtru !== 'all' && galeata(d) !== filtru) return false;
    return raCauta(q, d.name, d.plate, d.imei, d.company_name);
  }).sort((a, b) => (momentMs(b.last_position_time || b.last_seen) || 0) - (momentMs(a.last_position_time || a.last_seen) || 0)), [items, filtru, q]);
  const grup = useMemo(() => grupuri(rows), [rows]);

  // Deschis sau închis: „Neasignate" mereu deschis, „Arhivate" închis; o firmă e deschisă dacă ai căutat ceva,
  // dacă are ceva de rezolvat sau dacă sunt cel mult 5 grupuri. O problemă nu stă ascunsă după un rând închis.
  function deschis(g: Grup, pb: number): boolean {
    if (manual[g.k] != null) return manual[g.k];
    if (g.k === '_neas') return true;
    // „Arhivate" stă închis — dar nu când chiar le cauți (pastila „Arhivate" sau o căutare), altfel ecranul ar arăta un singur rând închis.
    if (g.k === '_arh') return filtru === 'archived' || !!q.trim();
    return !!q.trim() || pb > 0 || grup.length <= 5;
  }

  function open(d: any) { setSel(d); setCompanyId(d.company_id != null ? String(d.company_id) : ''); setCanIface(d.can_interface || ''); setIssueNote(''); }

  // Semnalare / anulare „problemă la montaj" (reversibilă) — direct din foaia aparatului
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
      const mutat = (sel.company_id ?? null) !== newCo;
      const altCan = (sel.can_interface || '') !== canIface;
      if (!mutat && !altCan) { showToast('Nimic de salvat — n-ai schimbat nimic'); setSel(null); return; }
      // Mesajul spune CE s-a salvat, cu vorbele web-ului (raxDevSetCompany / raxDevSetIface): mai ales când
      // aparatul tocmai a ieșit din flota unui client, fondatorul trebuie să vadă asta, nu un „Salvat".
      const spus: string[] = [];
      if (mutat) { await Api.moveDevice(sel.imei, newCo); spus.push(newCo == null ? 'Dispozitiv dezasignat' : 'Asignat la companie'); }
      if (altCan) {
        try { await Api.setCanInterface(sel.imei, canIface || null); }
        catch (e: any) {
          if (!spus.length) throw e;
          // Firma s-a schimbat deja: spunem și asta, nu doar eroarea — altfel pare că nu s-a salvat nimic.
          showToast(spus[0] + ' · interfața CAN nu s-a salvat: ' + (e?.message || 'eroare'), true); setSel(null); reload(); return;
        }
        spus.push('Interfață CAN: ' + (canIface || 'auto'));
      }
      showToast(spus.join(' · ')); setSel(null); reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); } finally { setSaving(false); }
  }

  // „Arhivează" (aparat activ) / „Respinge" (aparat neasignat) — același drum pe server: întâi se copiază
  // istoricul, apoi se taie conexiunea și IMEI-ul iese din lista celor acceptate. Reversibil din Arhivate.
  async function arhiveaza() {
    if (!sel) return;
    const respinge = sel.company_id == null;
    if (!confirm((respinge ? 'Respingi' : 'Arhivezi') + ' dispozitivul ' + sel.imei + '?\nNu se mai stochează date de la el (reversibil prin Restaurează).')) return;
    setSaving(true);
    try { await Api.archiveDevice(sel.imei); showToast(respinge ? 'Dispozitiv respins' : 'Dispozitiv arhivat'); setSel(null); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setSaving(false); }
  }

  // Mod strict: un aparat neînregistrat bate la ușă. „Aprobă" îl trece în lista celor acceptate (neasignat).
  async function aproba(imei: string) {
    setBusyImei(imei);
    try { await Api.createDevice({ imei }); showToast('IMEI aprobat — se va conecta la următoarea încercare'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusyImei(''); }
  }
  async function ignora(imei: string) {
    setBusyImei(imei);
    try { await Api.dismissDeviceAttempt(imei); showToast('Încercare ignorată'); reload(); }
    catch (e: any) { showToast(e?.message || 'Eroare', true); } finally { setBusyImei(''); }
  }

  // ── Adăugare manuală (super): pre-înregistrează IMEI → allow-list (mod strict). ──
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

  const chip = (k: Filtru, label: string, atentie = false) => (
    <button type="button" class={'fd-chip' + (filtru === k ? ' on' : '') + (atentie && counts[k] ? ' atentie' : '')} onClick={() => setFiltru(k)}>
      {label} <span class="cnt">{counts[k]}</span>
    </button>
  );

  function rand(d: any) {
    const b = galeata(d);
    const sg = semnal(d);
    return (
      <button type="button" class="fd-rand" onClick={() => open(d)}>
        <span class="mid">
          <div class="nm">{d.name || d.plate || d.imei}{d.name && d.plate ? ' · ' + d.plate : ''}</div>
          <div class="sub">IMEI {d.imei} · {d.can_interface ? String(d.can_interface).toUpperCase() : 'CAN auto'}</div>
          {/* Semnalul nu se arată la arhivate: pe alea le-am oprit noi, tăcerea lor e normală. */}
          {b !== 'archived' && <div class="sub" style={'font-weight:700;color:' + culoare(sg)}>● {sg.t}</div>}
          {b !== 'archived' && <div class="sub">ultima poziție {dataOra(d.last_position_time || d.last_seen)}</div>}
        </span>
        <span class="rt">
          {d.install_issue && <span class="fd-pill warn">⚠ montaj</span>}
          {b === 'archived' ? <span class="fd-pill">arhivat</span> : b === 'unassigned' ? <span class="fd-pill warn">neasignat</span> : null}
          <Icon name="chevronR" size={18} color="var(--text-muted)" />
        </span>
      </button>
    );
  }

  return (
    <div class="screen">
      <AntetFondator titlu="Dispozitive" onBack={() => loc.route('/meniu')}
        dreapta={<button class="h-btn" onClick={openAdd} aria-label="Adaugă dispozitiv"><Icon name="plus" /></button>} />
      <div class="content has-tabbar" style="padding-bottom:24px">
        {/* Modul strict: starea recepției, spusă o dată, sus. */}
        {strict === true && <Banda ton="ok" icon="shield"><b>Mod strict ACTIV</b> — doar IMEI-urile pre-înregistrate sunt acceptate; trackerele necunoscute sunt respinse la conectare (nu se stochează nimic).</Banda>}
        {strict === false && <Banda ton="info" icon="shield">Mod strict OPRIT — orice tracker se poate conecta (auto-descoperire).</Banda>}
        {attempts.length > 0 && (
          <div class="fd-gr" style="border-color:color-mix(in srgb, var(--orange) 55%, transparent)">
            <div style="padding:11px 12px 4px;font-size:12.5px;line-height:1.45;font-weight:700;color:var(--fd-warn)">
              <Icon name="alert" size={14} style="vertical-align:-2px;margin-right:5px" />
              {attempts.length} dispozitiv(e) neînregistrat(e) încearcă să se conecteze — aprobă-le dacă sunt ale tale:
            </div>
            {attempts.map((a) => (
              <div class="fd-rand" style="flex-wrap:wrap">
                <span class="mid">
                  <div class="nm">{a.imei}</div>
                  <div class="sub">{(a.count || 1)} încercări · ultima {dataOra(a.last)}</div>
                </span>
                <span style="display:flex;gap:6px;flex:0 0 auto">
                  <button type="button" class="fd-btn acc" disabled={busyImei === a.imei} onClick={() => aproba(a.imei)}><Icon name="check" size={14} /> Aprobă</button>
                  <button type="button" class="fd-btn muted" disabled={busyImei === a.imei} onClick={() => ignora(a.imei)}><Icon name="x" size={14} /> Ignoră</button>
                </span>
              </div>
            ))}
          </div>
        )}
        {/* Adopția se face din fișa aparatului (pe telefon nu e coloana „Companie" de pe web), deci o spunem. */}
        {counts.unassigned > 0 && (
          <Banda ton="warn" icon="bell" onClick={() => setFiltru('unassigned')}>
            {counts.unassigned} dispozitiv(e) neasignat(e) s-au conectat. Ca să adopți unul, alege-i firma din fișa aparatului; „Respinge" îl arhivează.
          </Banda>
        )}

        <div class="fd-chips">
          {chip('all', 'Toate')}
          {chip('unassigned', 'Neasignate')}
          {chip('active', 'Active')}
          {chip('nosignal', 'Fără semnal', true)}
          {chip('archived', 'Arhivate')}
        </div>
        <input class="fd-search" value={q} onInput={(e: any) => setQ(e.target.value)} placeholder="Caută nume / număr / IMEI / companie…" />

        {err && <div class="adm-empty" style="color:var(--red)">{err}</div>}
        {items == null && !err && <div class="adm-empty"><div class="spin" style="margin:0 auto" /></div>}
        {items != null && !err && rows.length === 0 && <div class="adm-empty"><Icon name="cpu" size={40} class="ic" /><div>Niciun dispozitiv în filtrul curent.</div></div>}
        {items != null && rows.length > 0 && grup.map((g) => {
          const pb = g.dev.filter(deRezolvat).length;
          const e = deschis(g, pb);
          const lim = cate[g.k] || PAS;
          return (
            <GrupFirma key={g.k} nume={g.nume} deschis={e}
              onToggle={() => setManual((m) => ({ ...m, [g.k]: !e }))}
              onFirma={g.coId != null ? () => loc.route(adresaFirmei(g.coId as number)) : undefined}
              sumar={<>{nApar(g.dev.length)}{pb ? <> · <b>{pb} de rezolvat</b></> : null}</>}>
              {g.dev.slice(0, lim).map(rand)}
              {g.dev.length > lim && (
                <button type="button" class="fd-inca" style="width:100%;text-align:left;background:transparent;border:none;font-family:inherit"
                  onClick={() => setCate((c) => ({ ...c, [g.k]: lim + PAS }))}>
                  și încă {g.dev.length - lim} — caută, sau atinge aici ca să le arăt
                </button>
              )}
            </GrupFirma>
          );
        })}
      </div>

      {sel && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !saving) setSel(null); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="cpu" size={18} color="var(--accent)" /> {sel.name || sel.plate || sel.imei}</b><button class="h-btn" onClick={() => setSel(null)} aria-label="Închide"><Icon name="x" /></button></div>
            <div class="sheet-body">
              <div class="frm">
                <div style="font-size:12.5px;color:var(--text-muted)">IMEI {sel.imei}{sel.plate ? ' · ' + sel.plate : ''}</div>
                {!arhivat(sel) && (() => {
                  const sg = semnal(sel);
                  return <div style="font-size:13px"><b style={'color:' + culoare(sg)}>● {sg.t}</b><span style="color:var(--text-muted)"> · ultima poziție {dataOra(sel.last_position_time || sel.last_seen)}</span></div>;
                })()}
                {arhivat(sel) ? (
                  <div class="fld"><label>Companie</label>
                    <div style="font-size:13px;line-height:1.5;color:var(--text-muted)">{sel.company_name || 'Fără firmă'} · Aparat arhivat — îl restaurezi din Dispozitive arhivate.</div>
                    <button class="fd-btn" style="align-self:flex-start" onClick={() => loc.route('/admin/archived')}><Icon name="archive" size={14} /> Deschide Dispozitive arhivate</button>
                  </div>
                ) : (
                  <div class="fld"><label>Companie</label>
                    <select value={companyId} onChange={(e: any) => setCompanyId(e.target.value)}>
                      <option value="">— Neasignat —</option>
                      {companies.map((c) => <option value={c.value}>{c.label}</option>)}
                    </select>
                    {sel.company_id == null && <span style="font-size:11.5px;color:var(--text-muted)">Alege firma și apasă „Salvează" ca s-o adopți.</span>}
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
                      <span class="fd-pill warn" style="flex:1;min-width:140px;white-space:normal">⚠ {sel.install_issue.note || 'semnalată'}{sel.install_issue.at ? ' · ' + new Date(Number(sel.install_issue.at)).toLocaleDateString('ro-RO') : ''}</span>
                      <button class="fd-btn" disabled={saving} onClick={() => toggleIssue(false)}>Anulează semnalarea</button>
                    </div>
                  ) : (
                    <div style="display:flex;align-items:center;gap:8px">
                      <input style="flex:1" value={issueNote} placeholder="detalii (opțional)" onInput={(e: any) => setIssueNote(e.target.value)} />
                      <button class="fd-btn warn" disabled={saving} onClick={() => toggleIssue(true)}>⚠ Semnalează</button>
                    </div>
                  )}
                </div>
                <div class="frm-actions"><button class="btn btn-primary" disabled={saving} onClick={save}>{saving ? 'Se salvează…' : 'Salvează'}</button></div>
                {!arhivat(sel) && (
                  <div style="border-top:1px solid var(--border);padding-top:12px;display:flex;flex-direction:column;gap:6px">
                    <button class="fd-btn danger" style="min-height:44px" disabled={saving} onClick={arhiveaza}>
                      <Icon name="ban" size={15} /> {sel.company_id == null ? 'Respinge' : 'Arhivează'}
                    </button>
                    <span style="font-size:11.5px;color:var(--text-muted);line-height:1.45">
                      {sel.company_id == null
                        ? 'Un aparat străin sau greșit: nu mai primește date. Se poate restaura din Dispozitive arhivate.'
                        : 'La încheierea contractului: nu mai primește date, dar istoricul de până acum se păstrează. Reversibil din Dispozitive arhivate.'}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {adding && (
        <div class="sheet-ov" onClick={(e: any) => { if (e.target === e.currentTarget && !saving) setAdding(false); }}>
          <div class="sheet">
            <div class="sheet-h"><b><Icon name="plus" size={18} color="var(--accent)" /> Adaugă dispozitiv</b><button class="h-btn" onClick={() => setAdding(false)} aria-label="Închide"><Icon name="x" /></button></div>
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
                  <b style="color:var(--fd-warn)">⚠ Problemă la montaj</b> <span style="font-size:11.5px;color:var(--text-muted)">(se poate anula ulterior)</span>
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
