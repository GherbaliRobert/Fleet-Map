import type { ComponentChildren, JSX } from 'preact';
import { useLocation } from 'preact-iso';
import { me } from '../app/store';
import { Icon } from './Icon';
import '../screens/firma.css';

// Bucățile comune ale ecranelor de administrare a firmei (Roluri, Adrese de email, Istoric activitate,
// Aparate GPS, Afișaj pentru toți): capul paginii, anunțul de sus și pagina calmă pentru cine n-are ce căuta.

export type FmMesaj = { t: string; rau?: boolean } | null;

// Anunțul de sus: verde = s-a făcut, roșu = refuzul serverului, cu vorbele lui. Stă până îl închide omul —
// un toast de două secunde pierdea exact propozițiile de citit.
export function FmMsg({ msg, onClose }: { msg: FmMesaj; onClose?: () => void }) {
  if (!msg) return null;
  return (
    <div class={'fm-msg' + (msg.rau ? ' rau' : '')} role={msg.rau ? 'alert' : 'status'}>
      <Icon name={msg.rau ? 'alert' : 'check'} size={17} color={msg.rau ? 'var(--red)' : 'var(--fm-ok)'} />
      <span>{msg.t}</span>
      {onClose && <button class="fm-x" onClick={onClose} aria-label="Închide"><Icon name="x" size={15} /></button>}
    </div>
  );
}

export function FmScreen({ titlu, children, dreapta }: { titlu: string; children: ComponentChildren; dreapta?: ComponentChildren }) {
  const loc = useLocation();
  return (
    <div class="screen">
      <header class="app-header">
        <button class="h-btn" onClick={() => loc.route('/meniu')} aria-label="Înapoi"><Icon name="chevronL" /></button>
        <div class="h-title">{titlu}</div>
        {dreapta || <div style="width:36px" />}
      </header>
      <div class="content" style="padding:14px 14px calc(28px + var(--sab))">{children}</div>
    </div>
  );
}

// Poarta ecranelor de firmă, aceeași regulă ca rândul din meniu:
//  • fără dreptul cerut → pagina calmă „nu e pentru rolul tău" (se putea ajunge aici dintr-un link vechi);
//  • contul de PLATFORMĂ (fără firmă) → explicația, ca pe web: reglajele astea se scriu într-o firmă, iar
//    serverul refuză oricum salvarea. Mai bine spus de la început decât după ce omul completează un formular.
// Întoarce null când omul poate intra.
export function poartaFirma(drept: 'manageUsers' | 'manageFleet', titlu: string, ce: string, laNoi?: string): JSX.Element | null {
  const u = me.value;
  if (u && u.isSuper && u.companyId == null) {
    return (
      <FmScreen titlu={titlu}>
        <PaginaCalma icon="layers" titlu={ce} text={laNoi ||
          ('Contul tău e cont de platformă: nu ține de o firmă anume, ci le vede pe toate. Ecranul ăsta e al '
          + 'administratorului unei firme, iar ce face el aici se aplică numai la firma lui.')} />
      </FmScreen>
    );
  }
  if (!u || !u.permissions || !u.permissions[drept]) {
    return (
      <FmScreen titlu={titlu}>
        <PaginaCalma icon="lock" titlu="Ecranul nu e disponibil pentru rolul tău" text={
          'Ecranul ăsta e al administratorului firmei. Dacă ai nevoie de el, cere-i administratorului să ți-l deschidă.'} />
      </FmScreen>
    );
  }
  return null;
}

function PaginaCalma({ icon, titlu, text }: { icon: 'lock' | 'layers'; titlu: string; text: string }) {
  return (
    <div class="center-msg" style="display:flex;flex-direction:column;align-items:center;gap:10px;padding-top:48px">
      <span style="width:56px;height:56px;border-radius:16px;background:var(--bg-panel);border:1px solid var(--border);display:inline-flex;align-items:center;justify-content:center">
        <Icon name={icon} size={26} color="var(--text-muted)" />
      </span>
      <div style="font-weight:800;font-size:16px;color:var(--text-primary)">{titlu}</div>
      <div style="font-size:13.5px;line-height:1.5;max-width:320px">{text}</div>
    </div>
  );
}

// Fără diacritice și cu litere mici: „stefan" îl găsește pe „Ștefan" (ca pe web, _usrFaraDiacritice).
export function faraDiacritice(s: unknown): string {
  return String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}
