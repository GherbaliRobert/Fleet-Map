// Garda pentru modulele din „Management" (Tahograf, e-Transport, Taxa de drum).
// Pe web, cele trei stau în grupa „Management", pe care o vede doar cine are dreptul „Modifică flota"
// (administratorul și managerul firmei). Pe telefon apăreau oricui avea dreptul de rapoarte — dispecer,
// client, vizualizare — adică același om vedea alt meniu pe telefon decât pe web. Rândul din meniu dispare,
// iar dacă omul ajunge totuși la adresă (buton, notificare veche), vede pagina asta calmă, nu un ecran pe
// jumătate. Serverul își păstrează regulile lui (citirea cere rapoarte, scrierea cere flota).
import { useLocation } from 'preact-iso';
import { me } from '../app/store';
import { Icon } from '../components/Icon';

export function areFlota(): boolean {
  return !!me.value?.permissions?.manageFleet;
}

export function FaraDreptFlota({ titlu }: { titlu: string }) {
  const loc = useLocation();
  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => history.back()} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">{titlu}</div>
        <div style="width:36px" />
      </header>
      <div class="content has-tabbar">
        <div class="center-msg" style="display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:56px">
          <span style="width:56px;height:56px;border-radius:16px;background:var(--bg-panel);border:1px solid var(--border);display:inline-flex;align-items:center;justify-content:center">
            <Icon name="lock" size={26} color="var(--text-muted)" />
          </span>
          <div style="font-weight:800;font-size:16px;color:var(--text-primary)">Ecranul nu e disponibil pentru rolul tău</div>
          <div style="font-size:13.5px;line-height:1.5;max-width:300px">
            Ecranul ăsta ține de administrarea flotei. Îl văd cei care pot modifica flota — administratorul și managerul firmei.
            Dacă ai nevoie de el, cere-i administratorului firmei.
          </div>
          <button class="btn btn-primary" style="margin-top:8px" onClick={() => loc.route('/vehicles')}>Mergi la vehicule</button>
        </div>
      </div>
    </div>
  );
}
