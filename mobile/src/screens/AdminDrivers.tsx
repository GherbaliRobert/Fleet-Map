import { useEffect, useState } from 'preact/hooks';
import { AdminCrud, type CrudConfig, type FieldDef } from '../components/AdminCrud';
import { Api } from '../api/endpoints';
import { me } from '../app/store';

export function AdminDrivers() {
  const canWrite = !!me.value?.permissions?.manageFleet;
  const isSuper = !!me.value?.isSuper;
  const today = new Date().toISOString().slice(0, 10);
  const [companies, setCompanies] = useState<{ value: string; label: string }[]>([]);

  // Super-admin: încarcă companiile pentru selector (la adăugare) + filtru pe companie.
  useEffect(() => {
    if (!isSuper) return;
    Api.companies()
      .then((cs) => setCompanies((cs || []).map((c: any) => ({ value: String(c.id), label: c.name || ('#' + c.id) }))))
      .catch(() => {});
  }, [isSuper]);

  const fields: FieldDef[] = [
    { key: 'name', label: 'Nume complet', required: true, placeholder: 'Ex: Ion Popescu' },
    { key: 'phone', label: 'Telefon', type: 'tel', placeholder: '07xx xxx xxx' },
    { key: 'email', label: 'Email', type: 'email', placeholder: 'nume@exemplu.ro' },
    { key: 'license_number', label: 'Nr. permis', placeholder: 'Serie / număr' },
    { key: 'license_expiry', label: 'Expirare permis', type: 'date' },
  ];
  // Super-admin alege compania la adăugare; company_admin = automat compania proprie (fără câmp).
  if (isSuper) {
    fields.push({ key: 'company_id', label: 'Companie', type: 'select', required: true, placeholder: '— alege compania —', options: companies });
  }

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
    fields,
    itemTitle: (d) => d.name || '(fără nume)',
    itemSub: (d) => {
      const base = [d.phone, d.email].filter(Boolean).join(' · ') || '—';
      // super-admin: arată compania fiecărui șofer (prima, ca să rămână vizibilă la trunchiere)
      return isSuper && d.company_name ? (base === '—' ? d.company_name : `${d.company_name} · ${base}`) : base;
    },
    itemRight: (d) => {
      if (!d.license_expiry) return null;
      const exp = String(d.license_expiry).slice(0, 10);
      const cls = exp < today ? 'bad' : (exp < shift(today, 30) ? 'warn' : 'ok');
      return <span class={'adm-pill ' + cls}>permis {fmt(exp)}</span>;
    },
    filter: isSuper ? { field: 'company_id', options: companies } : undefined,
  };
  return <AdminCrud cfg={cfg} />;
}

function shift(d: string, days: number) {
  const t = new Date(d + 'T00:00:00');
  t.setDate(t.getDate() + days);
  return t.toISOString().slice(0, 10);
}
function fmt(d: string) { const [y, m, da] = d.split('-'); return `${da}.${m}.${y.slice(2)}`; }
