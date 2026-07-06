import { AdminCrud, type CrudConfig } from '../components/AdminCrud';
import { WorkSchedEditor } from '../components/WorkSchedEditor';
import { Api } from '../api/endpoints';
import { me } from '../app/store';

export function AdminGroups() {
  const canWrite = !!me.value?.permissions?.manageFleet;
  const cfg: CrudConfig = {
    title: 'Grupe',
    icon: 'layers',
    addLabel: 'Adaugă grupă',
    empty: 'Nicio grupă definită.',
    load: () => Api.groupsAll(),
    create: (b) => Api.createGroup(b),
    update: (id, b) => Api.updateGroup(id, b),
    remove: (id) => Api.deleteGroup(id),
    canWrite,
    fields: [
      { key: 'name', label: 'Nume grupă', required: true, placeholder: 'Ex: Camioane' },
      { key: 'description', label: 'Descriere', type: 'textarea', placeholder: 'Opțional' },
      { key: 'color', label: 'Culoare', type: 'color', default: '#3FE07D' },
    ],
    itemTitle: (g) => g.name || '(fără nume)',
    itemSub: (g) => g.description || (g.count != null ? `${g.count} vehicule` : '—'),
    itemRight: (g) => (
      <span style={`width:16px;height:16px;border-radius:5px;display:inline-block;background:${g.color || 'var(--text-muted)'}`} />
    ),
    renderExtra: (g) => (
      <div>
        <div style="font-size:12.5px;font-weight:700;color:var(--accent);margin-bottom:2px">Program de lucru (grupă)</div>
        <WorkSchedEditor value={g.work_schedule} allowInherit onSave={(ws: any) => Api.setGroupWorkSchedule(g.id, ws)} />
      </div>
    ),
  };
  return <AdminCrud cfg={cfg} />;
}
