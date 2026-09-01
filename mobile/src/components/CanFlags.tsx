import { useEffect, useState } from 'preact/hooks';
import { Icon } from './Icon';
import { loadCanCatalog, canColor, canBenzi, canText, canFlat } from '../lib/canflags';
import type { CanCatalog, CanFlag, Banda } from '../lib/canflags';
import './CanFlags.css';

// ─── Starea mașinii, ca la bordul ei ──────────────────────────────────────────────────────────
// Uși, lumini, martori — ce se întâmplă ACUM, dintr-o privire. Numele, pictogramele și explicațiile
// vin din `can_flags.js` de pe server (prin /api/can-flags), NU sunt scrise aici.
//
// Așezarea nu mai e pe categorii („Lumini", „Camion"…). Avea sens cât se arătau toate cele ~120 de
// plăcuțe, aprinse și stinse. De când se văd doar cele active, categoriile rămâneau aproape goale —
// cinci titluri cu câte o plăcuță sub fiecare. Acum se așază după cât de mult cer atenție:
// starea mașinii · martori aprinși · ce e deschis · ce e pornit. Regula e în `canBenzi`, iar ordinea
// benzii de stare vine de la server, ca web-ul și telefonul să nu se desincronizeze.
export function CanFlags({ io }: { io: any }) {
  const [cat, setCat] = useState<CanCatalog | null>(null);
  // Plăcuța atinsă → balonul cu explicația (cerut de Robert, 26.08). A doua atingere îl închide.
  const [ales, setAles] = useState<string | null>(null);
  useEffect(() => { let viu = true; loadCanCatalog().then((c) => { if (viu) setCat(c); }); return () => { viu = false; }; }, []);
  if (!cat) return null;

  const flat = canFlat(io);
  const nedecodate = new Set(cat.undecoded || []);
  const areSf = cat.flags.some((f) => f.key.startsWith('_sf_') && flat[f.key] !== undefined);
  const areCf = cat.flags.some((f) => f.key.startsWith('_cf_') && flat[f.key] !== undefined);

  if (!areSf && !areCf) {
    // Mașina are adaptor CAN (trimite cifre) dar nu și cele două semnale de stare — IO 132 și 123.
    // Fără rândul ăsta, secțiunea lipsea pur și simplu și părea că aplicația e stricată. Aceeași
    // regulă ca în panoul din web; textul e ținut identic intenționat.
    const areCan = Object.keys(io || {}).some((k) => k.indexOf('can_') === 0);
    if (!areCan) return null;
    const brut = (io && (io.can_security_state_flags !== undefined || io.can_control_state_flags !== undefined));
    return (
      <div class="cfm">
        <div class="cfm-h"><Icon name="gauge" size={14} sw={1.8} /> <b>Starea mașinii</b></div>
        <div class="cfm-note">
          {brut
            ? 'Mașina trimite semnalele de stare, dar nu le-am putut desface — anunță-ne, e o problemă de-a noastră, nu a adaptorului.'
            : 'Mașina asta nu trimite semnalele de stare: nici uși, nici lumini, nici martori de bord. Adaptorul ei citește de pe magistrală doar valorile numerice de mai sus. Ține de ce anume suportă adaptorul pe modelul respectiv, nu de aplicație.'}
        </div>
      </div>
    );
  }

  // Semnale pe care fișa adaptorului le listează, dar pe care încă nu știm să le citim. Nu le
  // desenăm — ar fi singurele casete stinse de pe ecran — dar spunem că lipsesc.
  let necitite = 0;
  cat.flags.forEach((f) => {
    const v = flat[f.key];
    if (v !== undefined && v !== null) return;
    if (nedecodate.has(f.key) && ((f.key.startsWith('_sf_') && areSf) || (f.key.startsWith('_cf_') && areCf))) necitite++;
  });

  const b = canBenzi(cat, flat);
  const gol = !b.stare.length && !b.martori.length && !b.deschis.length && !b.active.length;

  // Pictograma: la treaptă litera E starea, deci desenăm caseta cu litera primită.
  const desen = (f: CanFlag, val: any): any => {
    if (f.kind === 'text' && val) {
      const n = 'gear' + String(val).toUpperCase();
      if (n === 'gearP' || n === 'gearR' || n === 'gearN' || n === 'gearD') return n;
    }
    return f.mi;
  };
  const aprinsa = (f: CanFlag, val: any) =>
    f.kind === 'text' ? (val !== '' && val !== null && val !== undefined)
      : f.kind === 'code' ? Number(val) > 0 : !!val;

  const toate: Banda[] = [...b.stare, ...b.martori, ...b.deschis, ...b.active];
  const balon = toate.find((x) => x.f.key === ales) || null;

  function Placa({ x, mare }: { x: Banda; mare?: boolean }) {
    const on = aprinsa(x.f, x.val);
    return (
      <button
        type="button"
        class={'cfm-t k-' + x.f.kind + (on ? ' lit' : '') + (mare ? ' big' : '') + (ales === x.f.key ? ' sel' : '')}
        style={on ? { '--c': canColor(x.f.kind) } as any : undefined}
        onClick={() => setAles(ales === x.f.key ? null : x.f.key)}
      >
        <Icon name={desen(x.f, x.val) as any} size={mare ? 24 : 20} sw={1.7} />
        <span class="cfm-l">{x.f.label}</span>
        <span class="cfm-s">{canText(cat!, x.f, x.val)}</span>
      </button>
    );
  }

  // Prima bandă („starea mașinii") nu primește titlu: e chiar subiectul panoului, iar un al doilea
  // titlu identic sub el arăta a greșeală.
  function Banda({ cheie, titlu, icon, lista, mare }: { cheie: string; titlu: string; icon: any; lista: Banda[]; mare?: boolean }) {
    if (!lista.length) return null;
    return (
      <div class={'cfm-band b-' + cheie}>
        {titlu ? <div class="cfm-bt"><Icon name={icon} size={12} sw={1.9} /> {titlu} <span class="cfm-n">{lista.length}</span></div> : null}
        <div class="cfm-grid">{lista.map((x) => <Placa key={x.f.key} x={x} mare={mare} />)}</div>
      </div>
    );
  }

  return (
    <div class="cfm">
      <div class="cfm-h">
        <Icon name="gauge" size={14} sw={1.8} /> <b>Starea mașinii</b>
        <span class="cfm-hint">doar ce e activ acum</span>
      </div>

      {gol && <div class="cfm-ok"><Icon name="check" size={14} sw={2} /> Totul închis, niciun martor aprins</div>}

      <Banda cheie="stare" titlu="" icon="gauge" lista={b.stare} mare />
      <Banda cheie="martori" titlu="Martori aprinși" icon="alert" lista={b.martori} />
      <Banda cheie="deschis" titlu="Deschis acum" icon="doorOpen" lista={b.deschis} />
      <Banda cheie="active" titlu="Pornite acum" icon="check" lista={b.active} />

      {balon && (
        <div class="cfm-balon" onClick={() => setAles(null)}>
          <div class="cfm-balon-cap">
            <Icon name={desen(balon.f, balon.val) as any} size={20} sw={1.7} color={aprinsa(balon.f, balon.val) ? canColor(balon.f.kind) : 'currentColor'} />
            <b>{balon.f.label}</b>
            <span class="cfm-balon-st" style={aprinsa(balon.f, balon.val) ? { color: canColor(balon.f.kind) } : undefined}>{canText(cat, balon.f, balon.val)}</span>
          </div>
          {balon.f.desc ? <div class="cfm-balon-txt">{balon.f.desc}</div> : null}
        </div>
      )}

      {necitite > 0 && (
        <div class="cfm-note">
          {necitite === 1
            ? '1 semnal pe care adaptorul îl poate trimite nu apare aici: încă nu știm unde îl pune în mesaj.'
            : necitite + ' semnale pe care adaptorul le poate trimite nu apar aici: încă nu știm unde le pune în mesaj.'}
          {' '}Le aprindem după ce le confirmăm pe un vehicul — până atunci preferăm să lipsească decât să arate greșit.
        </div>
      )}
    </div>
  );
}
