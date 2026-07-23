import { AdminCrud, type CrudConfig } from '../components/AdminCrud';
import { Api } from '../api/endpoints';
import { me, vehicles } from '../app/store';

const TYPES = ['Revizie', 'Schimb ulei', 'ITP', 'Anvelope', 'Filtre', 'Frâne', 'Reparație', 'Altele'];
const STATUS: Record<string, { label: string; cls: string }> = {
  pending: { label: 'În așteptare', cls: 'warn' },
  done: { label: 'Finalizat', cls: 'ok' },
  overdue: { label: 'Depășit', cls: 'bad' },
};

export function AdminMaintenance() {
  const canWrite = !!me.value?.permissions?.manageFleet;
  const vlist = vehicles.value;
  const vname = (imei: string) => {
    const v = vlist.find((x) => x.imei === imei);
    return v ? (v.name || v.plate || imei) : imei;
  };
  const vehicleOpts = vlist
    .map((v) => ({ value: v.imei, label: v.name || v.plate || v.imei }))
    .sort((a, b) => a.label.localeCompare(b.label));

  const cfg: CrudConfig = {
    title: 'Mentenanță',
    icon: 'wrench',
    addLabel: 'Adaugă intervenție',
    empty: 'Nicio intervenție programată.',
    load: () => Api.maintenance(),
    create: (b) => Api.createMaintenance(b),
    update: (id, b) => Api.updateMaintenance(id, b),
    remove: (id) => Api.deleteMaintenance(id),
    canWrite,
    fields: [
      { key: 'imei', label: 'Vehicul', type: 'select', required: true, options: vehicleOpts, placeholder: '— alege vehiculul —' },
      { key: 'type', label: 'Tip intervenție', type: 'select', required: true, options: TYPES.map((t) => ({ value: t, label: t })), placeholder: '— alege tipul —' },
      { key: 'description', label: 'Detalii', type: 'textarea', placeholder: 'Opțional' },
      { key: 'due_date', label: 'Scadență (dată)', type: 'date', half: true },
      { key: 'due_km', label: 'Scadență (km)', type: 'number', half: true, placeholder: 'km' },
      { key: 'interval_km', label: 'Repetă la fiecare (km)', type: 'number', half: true, placeholder: 'ex. 10000' },
      { key: 'interval_months', label: 'Repetă la fiecare (luni)', type: 'number', half: true, placeholder: 'ex. 12' },
      { key: 'cost', label: 'Cost estimat (lei)', type: 'number', placeholder: 'Opțional' },
      { key: 'status', label: 'Status', type: 'select', default: 'pending', options: [
        { value: 'pending', label: 'În așteptare' },
        { value: 'done', label: 'Finalizat' },
      ] },
    ],
    itemTitle: (m) => m.type || 'Intervenție',
    itemSub: (m) => {
      const parts = [vname(m.imei)];
      if (m.due_date) parts.push('scad. ' + String(m.due_date).slice(0, 10).split('-').reverse().join('.'));
      else if (m.due_km) parts.push(`la ${Number(m.due_km).toLocaleString('ro-RO')} km`);
      return parts.join(' · ');
    },
    itemRight: (m) => {
      const s = STATUS[m.status] || STATUS.pending;
      return <span class={'adm-pill ' + s.cls}>{s.label}</span>;
    },
  };
  return <AdminCrud cfg={cfg} />;
}
