import { AdminCrud, type CrudConfig } from '../components/AdminCrud';
import { Api } from '../api/endpoints';
import { me } from '../app/store';

export function AdminDrivers() {
  const canWrite = !!me.value?.permissions?.manageFleet;
  const today = new Date().toISOString().slice(0, 10);
  const cfg: CrudConfig = {
    title: 'Șoferi',
    icon: 'user',
    addLabel: 'Adaugă șofer',
    empty: 'Niciun șofer înregistrat.',
    load: () => Api.drivers(),
    create: (b) => Api.createDriver(b),
    update: (id, b) => Api.updateDriver(id, b),
    remove: (id) => Api.deleteDriver(id),
    canWrite,
    fields: [
      { key: 'name', label: 'Nume complet', required: true, placeholder: 'Ex: Ion Popescu' },
      { key: 'phone', label: 'Telefon', type: 'tel', placeholder: '07xx xxx xxx' },
      { key: 'email', label: 'Email', type: 'email', placeholder: 'nume@exemplu.ro' },
      { key: 'license_number', label: 'Nr. permis', placeholder: 'Serie / număr' },
      { key: 'license_expiry', label: 'Expirare permis', type: 'date' },
    ],
    itemTitle: (d) => d.name || '(fără nume)',
    itemSub: (d) => [d.phone, d.email].filter(Boolean).join(' · ') || '—',
    itemRight: (d) => {
      if (!d.license_expiry) return null;
      const exp = String(d.license_expiry).slice(0, 10);
      const cls = exp < today ? 'bad' : (exp < shift(today, 30) ? 'warn' : 'ok');
      return <span class={'adm-pill ' + cls}>permis {fmt(exp)}</span>;
    },
  };
  return <AdminCrud cfg={cfg} />;
}

function shift(d: string, days: number) {
  const t = new Date(d + 'T00:00:00');
  t.setDate(t.getDate() + days);
  return t.toISOString().slice(0, 10);
}
function fmt(d: string) { const [y, m, da] = d.split('-'); return `${da}.${m}.${y.slice(2)}`; }
