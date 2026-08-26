import { useEffect, useState } from 'preact/hooks';
import { AdminCrud, type CrudConfig, type FieldDef } from '../components/AdminCrud';
import { Api } from '../api/endpoints';
import { me } from '../app/store';

export function AdminDrivers() {
  const canWrite = !!me.value?.permissions?.manageFleet;
  const isSuper = !!me.value?.isSuper;
  const today = new Date().toISOString().slice(0, 10);
  const [companies, setCompanies] = useState<{ value: string; label: string }[]>([]);
  const [lic, setLic] = useState<any | null>(null);

  // Super-admin: încarcă companiile pentru selector (la adăugare) + filtru pe companie.
  useEffect(() => {
    if (!isSuper) return;
    Api.companies()
      .then((cs) => setCompanies((cs || []).map((c: any) => ({ value: String(c.id), label: c.name || ('#' + c.id) }))))
      .catch(() => {});
  }, [isSuper]);

  // Categoriile de pe permis vin de la server (license_cats.js). Dacă ruta nu răspunde, câmpul de bife
  // nu se desenează deloc — mai bine lipsește decât să inventăm aici o listă paralelă de categorii.
  useEffect(() => { Api.licenseCats().then(setLic).catch(() => setLic(null)); }, []);

  const fields: FieldDef[] = [
    { key: 'name', label: 'Nume complet', required: true, placeholder: 'Ex: Ion Popescu' },
    { key: 'phone', label: 'Telefon', type: 'tel', placeholder: '07xx xxx xxx' },
    { key: 'email', label: 'Email', type: 'email', placeholder: 'nume@exemplu.ro' },
    { key: 'license_number', label: 'Nr. permis', placeholder: 'Serie / număr' },
    { key: 'license_expiry', label: 'Expirare permis', type: 'date' },
  ];
  if (lic && Array.isArray(lic.categories)) {
    const proSet = new Set(lic.pro || []);
    fields.push({
      key: 'license_categories',
      label: 'Categorii pe permis',
      type: 'chips',
      options: lic.categories.map((c: any) => ({
        value: c.code, label: c.code, group: c.group, hi: proSet.has(c.code),
        title: c.label + (proSet.has(c.code) ? ' — categorie profesionistă' : ''),
      })),
      // Bifele de aici decid două lucruri pe care omul nu le-ar ghici: încadrarea („profesionist") și
      // dacă șoferul intră în scadențarul de tahograf. Le spunem pe loc, sub câmp, nu într-un ajutor.
      note: (v: string) => noteCategorii(v, lic),
    });
  }
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
      const cats = String(d.license_categories || '').split(',').map((s: string) => s.trim()).filter(Boolean);
      const base = [cats.length ? cats.join(',') : null, d.phone, d.email].filter(Boolean).join(' · ') || '—';
      // super-admin: arată compania fiecărui șofer (prima, ca să rămână vizibilă la trunchiere)
      return isSuper && d.company_name ? (base === '—' ? d.company_name : `${d.company_name} · ${base}`) : base;
    },
    itemRight: (d) => {
      // „Tahograf" e mai important decât data permisului: e singurul semn că omul intră în scadențarul
      // de descărcări. Permisul expirat rămâne pe locul doi, dar nu dispare.
      const areCard = lic ? hasAny(d.license_categories, lic.tacho) : false;
      const exp = d.license_expiry ? String(d.license_expiry).slice(0, 10) : null;
      const cls = exp ? (exp < today ? 'bad' : (exp < shift(today, 30) ? 'warn' : 'ok')) : null;
      if (!areCard && !exp) return null;
      return (
        <>
          {areCard && <span class="adm-pill" style="background:rgba(96,165,250,.14);color:#93c5fd">tahograf</span>}
          {exp && <span class={'adm-pill ' + cls}>permis {fmt(exp)}</span>}
        </>
      );
    },
    filter: isSuper ? { field: 'company_id', options: companies } : undefined,
  };
  return <AdminCrud cfg={cfg} />;
}

// Ce înseamnă bifele alese. Nicio regulă scrisă aici: `pro` și `tacho` vin din catalogul serverului.
function noteCategorii(v: string, lic: any) {
  const cats = String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!cats.length) return <div class="fld-note" style="color:var(--text-muted)">Nebifat — fără încadrare. Categoriile se iau de pe permis, rubrica 9.</div>;
  const pro = hasAny(v, lic.pro);
  const tac = hasAny(v, lic.tacho);
  return (
    <div class="fld-note">
      <span class={'adm-pill ' + (pro ? 'ok' : '')}>{pro ? 'Șofer profesionist' : 'Șofer'}</span>
      {tac && <span class="adm-pill" style="background:rgba(96,165,250,.14);color:#93c5fd">Card de tahograf — apare în Tahograf, de descărcat la 28 de zile</span>}
    </div>
  );
}
function hasAny(v: any, lista: string[] | undefined) {
  if (!Array.isArray(lista) || !lista.length) return false;
  const cats = String(v || '').split(',').map((s) => s.trim()).filter(Boolean);
  return cats.some((c) => lista.indexOf(c) >= 0);
}

function shift(d: string, days: number) {
  const t = new Date(d + 'T00:00:00');
  t.setDate(t.getDate() + days);
  return t.toISOString().slice(0, 10);
}
function fmt(d: string) { const [y, m, da] = d.split('-'); return `${da}.${m}.${y.slice(2)}`; }
