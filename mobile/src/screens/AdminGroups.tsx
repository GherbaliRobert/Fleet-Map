// Grupe — ca pe web (Management → Grupe): apeși pe grupă și îi vezi mașinile, le scoți (✕) sau aduci
// altele („B 12 ABC (acum în Camioane)"). Pe rând: câte vehicule are, câți oameni văd mașinile PRIN grupă
// și dacă are program propriu. Ștergerea spune tot: vehiculele rămân fără grupă, iar cine le vedea prin
// ea nu le mai vede. Mutarea merge pe ruta dedicată, care nu atinge șoferul mașinii.
import { useEffect, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Api } from '../api/endpoints';
import { me, showToast } from '../app/store';
import { Icon } from '../components/Icon';
import { Confirma, Grupa } from '../components/FlotaUi';
import { WorkSchedEditor } from '../components/WorkSchedEditor';
import { VehicleArt, vehCatOf } from '../components/VehicleArt';
import { flota, numar, uitaFlota } from '../components/flotaCommon';
import './detail.css';
import './admin.css';
import './flota.css';

// Pluralizare corectă: 1 vehicul / 2..19 vehicule / 20+ de vehicule.
function nrVehicule(n: number): string {
  if (n === 1) return '1 vehicul';
  const lt = n % 100;
  return n + ((n !== 0 && (lt === 0 || lt >= 20)) ? ' de vehicule' : ' vehicule');
}

export function AdminGroups() {
  const loc = useLocation();
  // Grupele le scrie cine are „modifică flota" (ca pe web și pe server); mutarea unei mașini cere în plus
  // ca firma să nu fi tăiat rolului editarea vehiculelor (serverul: requireEdit('vehicule')).
  const canWrite = !!me.value?.permissions?.manageFleet;
  const canMove = canWrite && !(me.value?.editariTaiate || []).includes('vehicule');
  // Programul de lucru al grupei merge pe altă rută, care cere în plus „Editare grupe"
  // (serverul: requireEdit('grupe')). Numele, descrierea și culoarea cer doar „modifică flota".
  const canSched = canWrite && !(me.value?.editariTaiate || []).includes('grupe');
  const [list, setList] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [devs, setDevs] = useState<any[]>([]);
  const [open, setOpen] = useState<number | null>(null);
  const [picker, setPicker] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState<any | null>(null);
  const [f, setF] = useState<any>({ name: '', description: '', color: '#38BDF8' });
  const [del, setDel] = useState<any | null>(null);

  async function reload() {
    setErr('');
    try { const r = await Api.groupsAll(); setList(Array.isArray(r) ? r : []); }
    catch (e: any) { setErr(e?.status === 403 ? 'Nu ai acces la grupe.' : (e?.message || 'Eroare la încărcare')); setList([]); }
  }
  useEffect(() => { reload(); flota(true).then(setDevs); }, []);

  const vehDin = (gid: any) => devs.filter((d) => String(d.group_id) === String(gid))
    .sort((a, b) => numar(devs, a.imei).localeCompare(numar(devs, b.imei), 'ro'));
  const numeGrupa = (gid: any) => { const g = (list || []).find((x) => String(x.id) === String(gid)); return g ? g.name : ''; };

  async function muta(imei: string, gid: number | null) {
    if (!imei || busy) return;
    setBusy(true);
    try {
      await Api.setDeviceGroup(imei, gid);
      // Pe loc, fără să așteptăm rețeaua: mașina apare în noua grupă (și dispare din cea veche).
      setDevs((p) => p.map((d) => d.imei === imei ? { ...d, group_id: gid, group_name: gid ? numeGrupa(gid) : '' } : d));
      uitaFlota();
      setPicker(null);
      showToast(gid ? 'Mutat în „' + numeGrupa(gid) + '”' : 'Scos din grupă');
      reload();
    } catch (e: any) { showToast(e?.message || 'Eroare', true); }
    finally { setBusy(false); }
  }

  function deschide(g: any | null) {
    setF(g ? { name: g.name || '', description: g.description || '', color: g.color || '#38BDF8' } : { name: '', description: '', color: '#38BDF8' });
    setForm(g || {});
  }
  async function salveaza() {
    const body = { name: String(f.name || '').trim(), description: String(f.description || '').trim(), color: f.color };
    if (!body.name) { showToast('Numele e obligatoriu', true); return; }
    setBusy(true);
    try {
      if (form && form.id != null) await Api.updateGroup(form.id, body); else await Api.createGroup(body);
      showToast(form && form.id != null ? 'Salvat' : 'Grupă adăugată'); setForm(null); await reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setBusy(false); }
  }
  async function sterge(g: any) {
    setBusy(true);
    try {
      await Api.deleteGroup(g.id);
      setDevs((p) => p.map((d) => String(d.group_id) === String(g.id) ? { ...d, group_id: null, group_name: '' } : d));
      uitaFlota();
      if (open === g.id) setOpen(null);
      setDel(null); setForm(null); showToast('Grupă ștearsă'); await reload();
    } catch (e: any) { showToast(e?.message || 'Eroare la ștergere', true); }
    finally { setBusy(false); }
  }

  const n = list ? list.length : 0;
  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">Grupe</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar" style="padding-bottom:96px">
        {list != null && !err && <div class="fl-count" style="margin:0 2px 10px">{n}{n === 1 ? ' grupă' : ' grupe'}</div>}
        {err && <div class="fl-empty" style="color:var(--red)">{err}</div>}
        {list == null && !err && <div class="fl-empty"><div class="spin" style="margin:0 auto" /></div>}
        {list != null && !err && (list.length ? (
          <div class="fl-list">
            {list.map((g) => {
              const col = g.color || '#94a3b8';
              const vs = vehDin(g.id);
              const deschis = open === g.id;
              const meta: string[] = [];
              if (g.user_count) meta.push(g.user_count + (g.user_count === 1 ? ' om vede mașinile prin grupă' : ' oameni văd mașinile prin grupă'));
              if (g.work_schedule) meta.push('program propriu');
              const libere = devs.filter((d) => String(d.group_id) !== String(g.id))
                .sort((a, b) => numar(devs, a.imei).localeCompare(numar(devs, b.imei), 'ro'));
              return (
                <Grupa open={deschis} onToggle={() => { setOpen(deschis ? null : g.id); setPicker(null); }}
                  lead={<span style={'width:14px;height:14px;border-radius:5px;flex:0 0 14px;background:' + col} />}
                  title={g.name || '(fără nume)'}
                  sub={[g.description, meta.join(' · ')].filter(Boolean).join(' — ') || undefined}
                  badge={<span class="fl-gn" style={'color:' + col}>{nrVehicule(vs.length)}</span>}
                  extra={canWrite ? <button class="icon-btn-sm" style="padding:12px 12px 12px 4px" aria-label="Editează grupa" onClick={() => deschide(g)}><Icon name="edit" size={17} /></button> : null}>
                  <div class="fl-sub" style="margin-top:0">Vehicule în grupă</div>
                  <div class="fl-chips">
                    {vs.map((v) => (
                      <span class={'fl-chip' + (canMove ? '' : ' nx')}>
                        <VehicleArt cat={vehCatOf(v)} color="currentColor" width={24} />{numar(devs, v.imei)}
                        {canMove && <button class="x" aria-label={'Scoate ' + numar(devs, v.imei) + ' din grupă'} disabled={busy} onClick={() => muta(v.imei, null)}><Icon name="x" size={15} /></button>}
                      </span>
                    ))}
                    {!vs.length && <span class="fl-rs" style="margin:4px 2px">Nicio mașină în grupa asta.</span>}
                  </div>
                  {canMove && (picker === g.id ? (
                    libere.length ? (
                      <div class="fld">
                        <select value="" disabled={busy} onChange={(e) => { const v = (e.target as HTMLSelectElement).value; if (v) muta(v, g.id); }}>
                          <option value="">— alege vehiculul —</option>
                          {libere.map((d) => <option value={d.imei}>{numar(devs, d.imei) + (d.group_id && d.group_name ? ' (acum în ' + d.group_name + ')' : '')}</option>)}
                        </select>
                      </div>
                    ) : <div class="fl-hint">Toate vehiculele sunt deja în această grupă.</div>
                  ) : (
                    <button class="fl-ab" style="align-self:flex-start" onClick={() => setPicker(g.id)}><Icon name="plus" size={14} /> Adaugă vehicul</button>
                  ))}
                </Grupa>
              );
            })}
          </div>
        ) : (
          <div class="fl-empty"><div class="ic"><Icon name="layers" size={30} /></div>Nicio grupă. Grupele dau acces oamenilor la mai multe vehicule deodată.</div>
        ))}
      </div>

      {canWrite && <button class="fab" onClick={() => deschide(null)} aria-label="Adaugă grupă"><Icon name="plus" size={26} color="#06210f" /></button>}

      {form && (
        <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !busy) setForm(null); }}>
          <div class="sheet">
            <div class="sheet-h">
              <b><Icon name="layers" size={18} color="var(--accent)" /> {form.id != null ? 'Editează grupa' : 'Adaugă grupă'}</b>
              <button class="h-btn" onClick={() => { if (!busy) setForm(null); }} aria-label="Închide"><Icon name="x" /></button>
            </div>
            <div class="sheet-body">
              <div class="frm">
                <div class="fld"><label>Nume grupă <span class="req">*</span></label><input value={f.name} placeholder="Ex: Camioane" onInput={(e) => setF((p: any) => ({ ...p, name: (e.target as HTMLInputElement).value }))} /></div>
                <div class="fld"><label>Descriere</label><textarea rows={2} value={f.description} placeholder="Opțional" onInput={(e) => setF((p: any) => ({ ...p, description: (e.target as HTMLTextAreaElement).value }))} /></div>
                <div class="fld"><label>Culoare</label><input type="color" value={f.color} onInput={(e) => setF((p: any) => ({ ...p, color: (e.target as HTMLInputElement).value }))} /></div>
                <div class="frm-actions">
                  {form.id != null && <button class="btn btn-danger-ghost" style="flex:0 0 auto" disabled={busy} onClick={() => setDel(form)} aria-label="Șterge grupa"><Icon name="trash" size={16} /></button>}
                  <button class="btn btn-primary" disabled={busy} onClick={salveaza}>{busy ? 'Se salvează…' : (form.id != null ? 'Salvează' : 'Adaugă')}</button>
                </div>
              </div>
              {form.id != null && (
                <div key={'ws-' + form.id} style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
                  <div style="font-size:12.5px;font-weight:700;color:var(--fl-ok);margin-bottom:2px">Program de lucru (grupă)</div>
                  {canSched
                    ? <WorkSchedEditor value={form.work_schedule} allowInherit onSave={(ws: any) => Api.setGroupWorkSchedule(form.id, ws).then((r: any) => { reload(); return r; })} />
                    : <div class="fl-hint" style="margin-top:4px">{form.work_schedule ? 'Grupa are program propriu. ' : ''}Programul grupei îl schimbă cine are dreptul să editeze grupele.</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      {del && (() => {
        const nv = vehDin(del.id).length, u = del.user_count || 0;
        let msg = 'Ștergi grupa „' + (del.name || '') + '”?\n\nVehiculele NU se șterg' + (nv ? ' — cele ' + nv + ' din ea rămân fără grupă.' : '.');
        if (u) msg += '\n\nATENȚIE: ' + u + (u === 1 ? ' utilizator vede' : ' utilizatori văd') + ' aceste vehicule PRIN grupa asta. După ștergere nu le mai văd, până le dai acces altfel.';
        return <Confirma title="Confirmare ștergere" okLabel="Șterge" danger busy={busy} text={msg} onCancel={() => setDel(null)} onOk={() => sterge(del)} />;
      })()}
    </div>
  );
}
