// VehicleDocs — actele vehiculului, în foaia de editare. ACELEAȘI rânduri ca în ecranul „Documente
// vehicule" (web: loadVehicleDocuments → docSlotCard): ordinea fixă din „Acte cerute", actele lipsă cu
// „Încarcă", cele existente cu Vezi / Editează / Nou / Șterge, iar jos „Acte înlocuite", pliabil.
// Citirea actului completează și fișa deschisă (setFisa); aplicația PROPUNE, omul confirmă.
import { useEffect, useState } from 'preact/hooks';
import { Api } from '../api/endpoints';
import { me } from '../app/store';
import { Icon } from './Icon';
import { Grupa } from './FlotaUi';
import { DocIstRand, DocRand, nevoiDe, ordoneazaActe, sloturi, tipuriActe, useDocOps } from './ActeVehicul';
import { type Catalog, catalog, flota, vehDe } from './flotaCommon';
import '../screens/flota.css';

// Folosite și de alte ecrane (detaliul notificării: „Vezi actul"; contractele: micșorarea scanului).
// Stau în ActeVehicul.tsx; le dăm mai departe de aici, ca importurile existente să nu se schimbe.
export { shrink, aduActul, deschideInAfara, type ActAdus } from './ActeVehicul';

export function VehicleDocs({ imei, fisa, setFisa }: { imei: string; fisa: any; setFisa: (patch: any) => void }) {
  // Montat doar când rolul poate modifica actele (VehicleDetail pune altfel o notă); verificăm totuși.
  const canEdit = !!me.value?.permissions?.manageFleet && !(me.value?.editariTaiate || []).includes('documente');
  const [acte, setActe] = useState<any[] | null>(null);
  const [hist, setHist] = useState<any[]>([]);
  const [req, setReq] = useState<any | null>(null);
  const [devs, setDevs] = useState<any[]>([]);
  const [cat, setCat] = useState<Catalog | null>(null);
  const [histOpen, setHistOpen] = useState(false);

  function reload() {
    Api.documentsOf(imei).then((d) => setActe(Array.isArray(d) ? d : [])).catch(() => setActe([]));
    Api.documentsHistory(imei).then((d) => setHist(Array.isArray(d) ? d : [])).catch(() => setHist([]));
  }
  useEffect(() => {
    reload();
    Api.docRequirements().then(setReq).catch(() => setReq(null));
    flota().then(setDevs);
    catalog().then(setCat);
  }, [imei]);

  const tipuri = tipuriActe(req, cat);
  const { ops, ui } = useDocOps({ devs, tipuri, reload, ctxImei: imei, fisa, onFisa: setFisa });
  const dev = vehDe(devs, imei) || { imei, vehicle_type: fisa?.vehicle_type };
  const randuri = acte ? sloturi(imei, ordoneazaActe(acte), nevoiDe(dev, req, cat)) : [];

  return (
    <div class="veh-docs" style="margin-top:16px;padding-top:14px;border-top:1px solid var(--border)">
      <div style="font-size:12.5px;font-weight:700;color:var(--fl-ok);margin-bottom:8px"><Icon name="fileBar" size={13} /> Documente vehicul</div>
      {acte == null ? <div class="spin" style="margin:10px auto" /> : (
        <div style="display:flex;flex-direction:column;gap:8px">
          {randuri.map((o) => (
            <DocRand o={o} req={req} canEdit={canEdit} onUpload={ops.upload} onView={ops.view}
              onEdit={ops.edit} onRenew={ops.renew} onDelete={ops.del} />
          ))}
          {!randuri.length && <div style="font-size:12.5px;color:var(--text-muted)">Niciun act încă.</div>}
          {hist.length ? (
            <Grupa open={histOpen} onToggle={() => setHistOpen(!histOpen)} title="Acte înlocuite"
              badge={<span class="fl-gn">{hist.length}{hist.length === 1 ? ' act' : ' acte'}</span>}>
              {hist.map((d) => <DocIstRand d={d} req={req} />)}
            </Grupa>
          ) : null}
          {canEdit && (
            <button class="btn fl-btn2" style="width:100%;font-size:14px" onClick={() => ops.add(imei)}>
              <Icon name="upload" size={15} /> Alt act sau talon — încarcă și completez eu
            </button>
          )}
        </div>
      )}
      {ui}
    </div>
  );
}
