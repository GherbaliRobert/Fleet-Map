import { useEffect, useState } from 'preact/hooks';
import { Icon } from './Icon';
import { loadCanCatalog, canColor, canBenzi, canText, canFlat } from '../lib/canflags';
import type { CanCatalog, CanFlag, Banda } from '../lib/canflags';
import './CanTellTales.css';

// ─── Banda de martori, sub hartă ──────────────────────────────────────────────────────────────
// Cerut de Robert (02.09): „pe mobile vreau să văd sub formă de pictograme undeva sub hartă, sub
// formă de martori, dar să rămână și secțiunea mai detaliată".
//
// Rostul ei e altul decât al ecranului „Date CAN": acolo te duci când vrei să te uiți la mașină; aici
// vezi fără să ceri. De aceea arată DOAR pictograme, cât mai puține — ce cere atenție (martori roșii,
// ce e deschis) plus cele trei stări permanente (frâna de mână, treapta, încuietoarea). Restul
// (luminile aprinse, aerul condiționat) nu urcă aici: nu e nimic de făcut cu ele.
//
// Atingi o pictogramă → un rând cu ce înseamnă. Aceleași desene și aceleași explicații ca în ecranul
// detaliat — o singură sursă (can_flags.js + can_icons din Icon.tsx).
export function CanTellTales({ io }: { io: any }) {
  const [cat, setCat] = useState<CanCatalog | null>(null);
  const [ales, setAles] = useState<string | null>(null);
  useEffect(() => { let viu = true; loadCanCatalog().then((c) => { if (viu) setCat(c); }); return () => { viu = false; }; }, []);
  if (!cat) return null;

  const flat = canFlat(io);
  const areStari = cat.flags.some((f) => flat[f.key] !== undefined && flat[f.key] !== null);
  if (!areStari) return null;              // mașina nu trimite stări → nu desenăm o bandă goală

  const b = canBenzi(cat, flat);
  // Ordinea contează: întâi ce e în neregulă, apoi ce e deschis, apoi starea. Așa cade ochiul.
  const lista: Banda[] = [...b.martori, ...b.deschis, ...b.stare];
  if (!lista.length) return null;

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

  const b_ales = lista.find((x) => x.f.key === ales) || null;
  const nrAtentie = b.martori.length + b.deschis.length;

  return (
    <div class="ctt">
      <div class="ctt-row">
        {lista.map((x) => {
          const on = aprinsa(x.f, x.val);
          return (
            <button
              key={x.f.key}
              type="button"
              class={'ctt-i k-' + x.f.kind + (on ? ' lit' : '') + (ales === x.f.key ? ' sel' : '')}
              style={on ? { '--c': canColor(x.f.kind) } as any : undefined}
              aria-label={x.f.label}
              onClick={() => setAles(ales === x.f.key ? null : x.f.key)}
            >
              <Icon name={desen(x.f, x.val) as any} size={21} sw={1.7} />
            </button>
          );
        })}
        {nrAtentie === 0 && <span class="ctt-ok"><Icon name="check" size={13} sw={2} /> totul în regulă</span>}
      </div>
      {b_ales && (
        <div class="ctt-exp" onClick={() => setAles(null)}>
          <b>{b_ales.f.label}</b>
          <span class="ctt-st" style={aprinsa(b_ales.f, b_ales.val) ? { color: canColor(b_ales.f.kind) } : undefined}>
            {canText(cat, b_ales.f, b_ales.val)}
          </span>
          {b_ales.f.desc ? <div class="ctt-txt">{b_ales.f.desc}</div> : null}
        </div>
      )}
    </div>
  );
}
