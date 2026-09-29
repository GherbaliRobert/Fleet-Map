// VehicleService — lucrările de service ale UNEI mașini, în foaia de editare a vehiculului (web: fila
// „Service" din fișă). Aceleași rânduri și aceeași fereastră ca în ecranul Mentenanță: vezi „depășit cu
// 2.300 km" cu roșu, bifezi, modifici, adaugi o lucrare cu mașina deja aleasă.
// Se montează DOAR când firma n-a tăiat rolului ecranul „mentenanta" (serverul refuză atunci lista) —
// verificarea e și aici, ca blocul să nu arate o eroare în locul lucrărilor.
import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { me, ecranAscuns } from '../app/store';
import { Icon } from './Icon';
import { MntRand, useMntOps } from './Mentenanta';
import { type Catalog, catalog, flota, mntFacuta, mntZileRamase } from './flotaCommon';
import '../screens/flota.css';

export function VehicleService({ imei }: { imei: string }) {
  const canEdit = !!me.value?.permissions?.manageFleet && !(me.value?.editariTaiate || []).includes('mentenanta');
  const [rows, setRows] = useState<any[] | null>(null);
  const [err, setErr] = useState('');
  const [devs, setDevs] = useState<any[]>([]);
  const [cat, setCat] = useState<Catalog | null>(null);
  const ascuns = ecranAscuns('mentenanta');

  function reload() {
    setErr('');
    Api.maintenanceOf(imei).then((r) => setRows(Array.isArray(r) ? r : [])).catch((e: any) => { setRows([]); setErr(e?.message || 'Eroare la încărcare'); });
  }
  useEffect(() => { if (!ascuns) { reload(); flota().then(setDevs); catalog().then(setCat); } }, [imei, ascuns]);
  const { ops, ui } = useMntOps({ reload, devs, cat, lucrari: rows, lockImei: true });
  if (ascuns) return null;

  const pending = (rows || []).filter((m) => !mntFacuta(m)).sort((a, b) => {
    const da = mntZileRamase(a), db = mntZileRamase(b);
    if (da == null && db == null) return 0; if (da == null) return 1; if (db == null) return -1; return da - db;
  });
  const done = (rows || []).filter(mntFacuta).sort((a, b) => String(b.done_at || b.done_date || '').localeCompare(String(a.done_at || a.done_date || '')));
  const rand = (m: any) => <MntRand m={m} cat={cat} canEdit={canEdit} onDone={ops.done} onEdit={ops.edit} onDelete={ops.del} onMoveDoc={ops.doc} />;

  return (
    <div class="veh-service" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <div style="display:flex;align-items:center;gap:8px;margin-bottom:8px">
        <div style="font-size:12.5px;font-weight:700;color:var(--fl-ok);flex:1"><Icon name="wrench" size={13} /> Plan service / mentenanță</div>
        {canEdit && <button class="fl-ab pri" onClick={() => ops.add(imei)}><Icon name="plus" size={15} /> Adaugă lucrare</button>}
      </div>
      {rows == null && <div class="spin" style="margin:10px auto" />}
      {err && <div style="font-size:12.5px;color:var(--red)">{err}</div>}
      {rows != null && !err && (pending.length || done.length ? (
        <div style="display:flex;flex-direction:column;gap:8px">
          {pending.length ? pending.map(rand) : <div class="fl-sub">Nimic de făcut</div>}
          {done.length ? <><div class="fl-sub">Făcute</div>{done.map(rand)}</> : null}
        </div>
      ) : <div style="font-size:12.5px;color:var(--text-muted)">Nicio lucrare de service pentru mașina asta.</div>)}
      {ui}
    </div>
  );
}
