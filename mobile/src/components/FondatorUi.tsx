import type { ComponentChildren } from 'preact';
import { Icon, type IconName } from './Icon';
import '../screens/fondator.css';
import { nrDe } from '../lib/numar';

// Bucăți comune ecranelor fondatorului (lotul 2b). Aceleași chenare ca pe web: un grup pe firmă (.rax-devgr),
// o bandă pentru ce trebuie văzut, nu căutat, și drumul „Deschide firma" — o SINGURĂ adresă pentru toate
// ecranele (Dispozitive, Arhivate, Tahograf, e-Transport), ca pe web raxOpenCompanyDetail(id): fișa firmei
// (CompanySheet, /admin/companies/:id, cu `?tab=` opțional).

export const adresaFirmei = (id: number | string, tab?: string) =>
  '/admin/companies/' + encodeURIComponent(String(id)) + (tab ? '?tab=' + encodeURIComponent(tab) : '');

// „azi" / „ieri" / „acum 5 zile" / data — ca `_raxCand` de pe web.
export function cand(iso: any): string {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (!isFinite(t)) return '—';
  const z = Math.floor((Date.now() - t) / 86400000);
  if (z <= 0) return 'azi';
  if (z === 1) return 'ieri';
  if (z < 30) return 'acum ' + nrDe(z, 'zi', 'zile');
  return new Date(t).toLocaleDateString('ro-RO');
}
export const numar = (n: any) => (Number(n) || 0).toLocaleString('ro-RO');

export function Banda({ ton = 'warn', icon, children, onClick }: { ton?: 'warn' | 'bad' | 'ok' | 'info'; icon?: IconName; children: ComponentChildren; onClick?: () => void }) {
  const ic = icon || (ton === 'ok' ? 'check' : ton === 'info' ? 'alertO' : 'alert');
  if (onClick) {
    return <button type="button" class={'fd-band tap ' + ton} onClick={onClick}><Icon name={ic} size={16} /><span>{children}</span></button>;
  }
  return <div class={'fd-band ' + ton}><Icon name={ic} size={16} /><span>{children}</span></div>;
}

// Capul unui grup: săgeata, numele, sumarul și (dacă e o firmă) butonul „Deschide firma".
export function GrupFirma({ nume, sumar, deschis, onToggle, onFirma, children }: {
  nume: string; sumar: ComponentChildren; deschis: boolean; onToggle: () => void; onFirma?: () => void; children: ComponentChildren;
}) {
  return (
    <div class="fd-gr">
      <button type="button" class="fd-gr-h" onClick={onToggle} aria-expanded={deschis}>
        <Icon name={deschis ? 'arrowDown' : 'chevronR'} size={16} color="var(--text-muted)" />
        <span class="ttl"><b>{nume}</b><span>{sumar}</span></span>
      </button>
      {onFirma && (
        <div class="fd-gr-bar">
          <button type="button" class="fd-btn" onClick={onFirma}><Icon name="building" size={14} /> Deschide firma</button>
        </div>
      )}
      {deschis && <div class="fd-gr-b">{children}</div>}
    </div>
  );
}

// Cifră mare cu eticheta dedesubt (Tahograf, e-Transport, Acasă).
export function Cifra({ v, l, cul }: { v: ComponentChildren; l: ComponentChildren; cul?: string }) {
  return <div class="fd-kpi"><div class="v" style={cul ? 'color:' + cul : ''}>{v}</div><div class="l">{l}</div></div>;
}

// Antetul comun: înapoi în meniu, titlul (numele rândului din meniu) și, opțional, reîmprospătarea.
export function AntetFondator({ titlu, onBack, onRefresh, dreapta }: { titlu: string; onBack: () => void; onRefresh?: () => void; dreapta?: ComponentChildren }) {
  return (
    <header class="app-header">
      <button class="h-btn" onClick={onBack} aria-label="Înapoi"><Icon name="chevronL" /></button>
      <div class="h-title">{titlu}</div>
      {dreapta || (onRefresh
        ? <button class="h-btn" onClick={onRefresh} aria-label="Reîncarcă"><Icon name="refresh" size={20} /></button>
        : <div style="width:36px" />)}
    </header>
  );
}
