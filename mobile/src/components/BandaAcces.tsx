// Banda de restanță / suspendare — pentru TOȚI oamenii unei firme, orice rol (dispecer, viewer, șofer…), ca pe web
// (applyAccessBanner, public/index.html). Până la 1.0.5 telefonul n-o avea deloc: un dispecer nu afla niciodată că
// firma are o factură restantă, iar la suspendare vedea doar erori scurte la fiecare ecran.
//
// Regulile, aceleași ca pe web:
//   • restanță (`access.status === 'grace'`): portocaliu, cu TEXTUL SERVERULUI (`access.mesaj`, scris o singură dată
//     în neplata.mesajClient, același ca în email). Telefonul nu socotește nicio zi, nicio sumă, nicio dată: dacă
//     regula de neplată se schimbă pe server, banda spune singură cifrele noi;
//   • suspendat (orice altă stare decât activ / restanță): roșu, cu textul de pe web (MESAJ_ACCES_SUSPENDAT, în store);
//   • super-adminul (contul de platformă) n-o vede niciodată; nici cine n-are firmă (`access` lipsă).
// Contul suspendat, ca pe web (hotărât pe 30.09): la PORNIREA aplicației iese afară, cu mesajul serverului pe ecranul
// de autentificare (store.ts, accesOprit); cu aplicația deja deschisă vede banda roșie până la următoarea pornire.
// Pe banda de RESTANȚĂ, cine are „Facturile mele" în meniu (dreptul de administrare a utilizatorilor, aceeași condiție
// ca rândul din meniu) primește și butonul spre ele (App.tsx) — singurul lucru în plus față de web.
// Ce NU se arată niciodată: `access.nota` (motivul scris de noi la o oprire de mână) — e o notă internă.
//
// Banda stă în fluxul paginii (App.tsx → Shell): sus, sub bara telefonului, deasupra titlului ecranului — ca pe web,
// unde stă deasupra barei de sus. Nu acoperă nimic: ecranul de dedesubt se strânge cu înălțimea ei.
import { Icon } from './Icon';
import { Api } from '../api/endpoints';
import { MESAJ_ACCES_SUSPENDAT, accesFirma, me, token, refreshMe } from '../app/store';
// --fl-warn: chihlimbarul scrisului, pe ambele teme (#f5b43c pe închisă, #b45309 pe luminoasă). Importat aici ca să
// fie sigur în pachet, oricare ecran s-ar deschide primul.
import '../screens/flota.css';
import './bandaAcces.css';

export interface Banda { fel: 'restanta' | 'suspendat'; text: string }

// Rezerva de pe web, pentru o restanță venită fără text (serverul îl trimite mereu; e doar plasa).
export const TEXT_RESTANTA_REZERVA = 'Aveți o factură restantă. Achitați-o ca accesul să nu se suspende.';

// Ce bandă se cuvine contului (null = niciuna). Aceeași hotărâre ca applyAccessBanner de pe web — legate printr-o
// probă care le rulează pe amândouă pe aceleași stări, făcute de stareAcces din server.
export function bandaAcces(m: unknown): Banda | null {
  const a = accesFirma(m);
  if (!a || a.status === 'active' || (m as { isSuper?: boolean }).isSuper) return null;
  if (a.status === 'grace') return { fel: 'restanta', text: String(a.mesaj || TEXT_RESTANTA_REZERVA) };
  return { fel: 'suspendat', text: MESAJ_ACCES_SUSPENDAT };
}

// Cât aplicația stă deschisă, starea firmei se poate schimba: factura trece de scadență, clientul plătește, îl oprim
// sau îl pornim noi. Web-ul recitește profilul la 4 secunde; telefonul întreabă o dată pe minut (App.tsx) și
// reîncarcă profilul (refreshMe, calea obișnuită) DOAR când accesul s-a schimbat — altfel nu atinge nimic și niciun
// ecran nu se redesenează. Fără asta, o firmă oprită cu aplicația deschisă vedea doar erori, fără bandă, până la
// următoarea revenire în aplicație (legătura live deschisă nu primește vestea: serverul nu o închide).
export const ACCES_VERIFICARE_MS = 60000;
export async function verificaAccesul(): Promise<boolean> {
  const t = token.value, m = me.value;
  if (!t || !m || m.isSuper) return false;                 // contul de platformă n-are bandă: nu întrebăm degeaba
  if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
  try {
    const nou = await Api.me();
    if (token.value !== t || !me.value) return false;      // între timp s-a delogat sau a intrat pe alt cont
    if (JSON.stringify(accesFirma(nou)) === JSON.stringify(accesFirma(me.value))) return false;
    await refreshMe();
    return true;
  } catch { return false; }                                // fără rețea: rămâne ce era
}

export function BandaAcces({ banda, onFacturi }: { banda: Banda | null; onFacturi?: () => void }) {
  if (!banda) return null;
  const rau = banda.fel === 'suspendat';
  return (
    <div class={'ba-banda ' + (rau ? 'ba-suspendat' : 'ba-restanta')} role={rau ? 'alert' : 'status'}>
      <div class="ba-rand">
        <span class="ba-ico" aria-hidden="true"><Icon name={rau ? 'ban' : 'alert'} size={18} /></span>
        <span class="ba-text">{banda.text}</span>
        {onFacturi && <button type="button" class="ba-btn" onClick={onFacturi}>Vezi facturile</button>}
      </div>
    </div>
  );
}
