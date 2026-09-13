import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { showToast } from '../app/store';
import { Icon } from './Icon';

// Vehiculele (și grupele) pe care le vede un cont care NU are „Vede toată flota": dispecerul, viewer-ul
// sau un rol căruia firma i-a tăiat dreptul ăsta. Aceeași rută ca pe web (GET/PUT /api/users/:id/access).
// ATENȚIE: serverul ÎNLOCUIEȘTE lista întreagă la salvare → trimitem mereu ambele liste, complete.
// (/access-until e altceva: termenul unui cont demo, doar super-admin.)
export interface AccessTarget { id: number; username: string; full_name?: string | null; company_id?: number | null; }

const vehLabel = (d: any) => String(d.plate || d.name || d.imei) + (d.plate && d.name ? ' · ' + d.name : '');
const sameCompany = (a: any, b: any) => String(a ?? '') === String(b ?? '');

export function UserVehicleAccess(props: { user: AccessTarget; isSuper: boolean; onClose: () => void; onSaved?: () => void }) {
  const { user, isSuper, onClose, onSaved } = props;
  const [devs, setDevs] = useState<any[] | null>(null);
  const [grps, setGrps] = useState<any[]>([]);
  const [selDev, setSelDev] = useState<Set<string>>(new Set());
  const [selGrp, setSelGrp] = useState<Set<number>>(new Set());
  // Atribuiri care nu apar în listă (vehicul arhivat, grupă a altei firme): le păstrăm neatinse la salvare,
  // ca bifele de pe ecran să nu șteargă pe tăcute ceva ce omul nici nu vede.
  const [keepDev, setKeepDev] = useState<string[]>([]);
  const [keepGrp, setKeepGrp] = useState<number[]>([]);
  const [q, setQ] = useState('');
  const [err, setErr] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let alive = true;
    setDevs(null); setErr('');
    Promise.all([Api.devices(), Api.groupsAll(), Api.userAccess(user.id)]).then(([d, g, acc]) => {
      if (!alive) return;
      // Super-adminul primește flota tuturor firmelor: arătăm doar ce ține de firma omului — alte mașini
      // oricum nu i s-ar deschide (serverul filtrează accesul pe compania contului).
      const inCo = (x: any) => !isSuper || sameCompany(x.company_id, user.company_id);
      const dl = (Array.isArray(d) ? d : [])
        .filter((x: any) => x && x.imei && x.status !== 'archived' && inCo(x))
        .sort((a: any, b: any) => vehLabel(a).localeCompare(vehLabel(b), 'ro'));
      const gl = (Array.isArray(g) ? g : []).filter((x: any) => x && x.id != null && inCo(x));
      const accDev: string[] = ((acc && acc.devices) || []).map(String);
      const accGrp: number[] = ((acc && acc.groups) || []).map(Number);
      const dSet = new Set(dl.map((x: any) => String(x.imei)));
      const gSet = new Set(gl.map((x: any) => Number(x.id)));
      setDevs(dl); setGrps(gl);
      setSelDev(new Set(accDev.filter((i) => dSet.has(i))));
      setSelGrp(new Set(accGrp.filter((i) => gSet.has(i))));
      setKeepDev(accDev.filter((i) => !dSet.has(i)));
      setKeepGrp(accGrp.filter((i) => !gSet.has(i)));
    }).catch((e: any) => {
      if (!alive) return;
      setErr(e?.message || 'Nu s-au putut încărca vehiculele.');
      setDevs([]);
    });
    return () => { alive = false; };
  }, [user.id]);

  const needle = q.trim().toLowerCase();
  const shown = (devs || []).filter((d) => !needle || ((d.name || '') + ' ' + (d.plate || '') + ' ' + d.imei).toLowerCase().includes(needle));

  function toggleDev(imei: string) {
    setSelDev((p) => { const n = new Set(p); if (n.has(imei)) n.delete(imei); else n.add(imei); return n; });
  }
  function toggleGrp(id: number) {
    setSelGrp((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  }
  // „Toate" / „Niciunul" respectă căutarea, ca pe web.
  function setShown(val: boolean) {
    setSelDev((p) => { const n = new Set(p); shown.forEach((d) => { const k = String(d.imei); if (val) n.add(k); else n.delete(k); }); return n; });
  }

  async function save() {
    setSaving(true);
    try {
      await Api.setUserAccess(user.id, Array.from(selDev).concat(keepDev), Array.from(selGrp).concat(keepGrp));
      showToast('Acces salvat');
      if (onSaved) onSaved();
      onClose();
    } catch (e: any) { showToast(e?.message || 'Eroare la salvare', true); }
    finally { setSaving(false); }
  }

  const who = user.full_name || user.username;
  const rowStyle = 'display:flex;align-items:center;gap:10px;min-height:42px;padding:4px 0;border-bottom:1px solid var(--border);font-size:14px';
  const boxStyle = 'width:18px;height:18px;flex:0 0 18px;accent-color:var(--accent)';
  const ready = devs != null && !err;

  return (
    <div class="sheet-ov" onClick={(e) => { if (e.target === e.currentTarget && !saving) onClose(); }}>
      <div class="sheet" style="height:86vh;max-height:86vh">
        <div class="sheet-h">
          <b><Icon name="car" size={18} color="var(--accent)" /> Vehicule atribuite</b>
          <button class="h-btn" onClick={onClose} aria-label="Închide"><Icon name="x" /></button>
        </div>
        <div style="padding:10px 16px;border-bottom:1px solid var(--border);display:flex;flex-direction:column;gap:9px">
          <div class="muted" style="font-size:12.5px;line-height:1.45">
            <b style="color:var(--text-primary)">{who}</b> vede doar vehiculele bifate aici și pe cele din grupele bifate. Administratorii și managerii văd automat toată flota firmei.
          </div>
          {ready && (devs as any[]).length > 0 && (
            <div style="display:flex;gap:8px;align-items:center">
              <input type="search" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} placeholder="caută vehicul…"
                autocapitalize="none" spellcheck={false}
                style="flex:1;min-width:0;background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary);border-radius:10px;padding:9px 11px;font-size:14px" />
              <button type="button" class="adm-act" onClick={() => setShown(true)}>Toate</button>
              <button type="button" class="adm-act" onClick={() => setShown(false)}>Niciunul</button>
            </div>
          )}
        </div>
        <div class="sheet-body" style="flex:1">
          {devs == null && <div class="adm-empty" style="padding:30px 0"><div class="spin" style="margin:0 auto" /></div>}
          {err && <div class="adm-empty" style="padding:30px 0;color:var(--red)">{err}</div>}
          {ready && (
            <>
              <div class="adm-sec2" style="margin-top:2px">Vehicule · {selDev.size} bifate</div>
              {(devs as any[]).length === 0 && <div class="muted" style="font-size:13px">Niciun vehicul.</div>}
              {(devs as any[]).length > 0 && shown.length === 0 && <div class="muted" style="font-size:13px">Niciun vehicul găsit.</div>}
              {shown.map((d) => {
                const k = String(d.imei);
                return (
                  <label style={rowStyle}>
                    <input type="checkbox" checked={selDev.has(k)} onChange={() => toggleDev(k)} style={boxStyle} />
                    <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{vehLabel(d)}</span>
                  </label>
                );
              })}
              <div class="adm-sec2">Acces pe grupe (toate vehiculele din grup)</div>
              {grps.length === 0 && <div class="muted" style="font-size:13px">Nicio grupă definită.</div>}
              {grps.map((g) => {
                const id = Number(g.id);
                const n = Number(g.vehicle_count);
                return (
                  <label style={rowStyle}>
                    <input type="checkbox" checked={selGrp.has(id)} onChange={() => toggleGrp(id)} style={boxStyle} />
                    <span style="flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">{g.name || ('Grupa #' + id)}</span>
                    {Number.isFinite(n) && <span class="muted" style="font-size:12px">{n} {n === 1 ? 'vehicul' : 'vehicule'}</span>}
                  </label>
                );
              })}
            </>
          )}
        </div>
        <div class="frm-actions" style="margin:0;padding:10px 16px;border-top:1px solid var(--border)">
          <button class="btn" style="background:var(--bg-dark);border:1px solid var(--border);color:var(--text-primary)" disabled={saving} onClick={onClose}>Anulează</button>
          <button class="btn btn-primary" disabled={saving || !ready} onClick={save}>{saving ? 'Se salvează…' : 'Salvează'}</button>
        </div>
      </div>
    </div>
  );
}
