// CampParola.tsx — caseta de parolă cu „ochiul”, bara de tărie și sfaturile, pe telefon (20.11, Alin: „ochiul… și la logare, nu doar la
// creare” → „1. DA”). Aceleași texte și aceeași regulă ca pe web (public/js/parola.js), din lib/parola.ts. Intrarea și „Contul meu”.
import { Icon } from './Icon';
import { forta, potrivire, SFATURI, EXEMPLU } from '../lib/parola';
import './campParola.css';

type P = {
  id?: string; value: string; onInput: (v: string) => void; autocomplete: string; placeholder?: string;
  vizibil: boolean; onComuta: () => void;
};

export function CampParola(p: P) {
  const t = p.vizibil ? 'Ascunde parola' : 'Arată parola';
  return (
    <div class="camp-parola">
      <input id={p.id} type={p.vizibil ? 'text' : 'password'} autocomplete={p.autocomplete} autocapitalize="none" autocorrect="off"
        spellcheck={false} placeholder={p.placeholder} value={p.value}
        onInput={(e) => p.onInput((e.target as HTMLInputElement).value)} />
      <button type="button" class="ochi" aria-label={t} title={t} aria-pressed={p.vizibil ? 'true' : 'false'} onClick={p.onComuta}>
        <Icon name={p.vizibil ? 'eyeOff' : 'eye'} size={20} />
      </button>
    </div>
  );
}

// Bara de tărie + sfaturile, bifate pe loc.
export function SfaturiParola({ parola }: { parola: string }) {
  const f = forta(parola);
  return (
    <div class="pf">
      <div class={'pf-forta' + (f.nivel ? ' pf-' + f.nivel : '')} aria-live="polite">
        <div class="pf-bara"><i style={{ width: f.latime + '%' }} /></div>
        <span class="pf-text">{f.text}</span>
      </div>
      <div class="pf-sfaturi">
        <p class="pf-titlu">Pentru o parolă puternică:</p>
        <ul>
          {SFATURI.map(([k, t, mic]) => (
            <li key={k} class={f.bife[k] ? 'da' : ''}><b>✓</b>{t}{mic ? <small> {mic}</small> : null}</li>
          ))}
        </ul>
        <p class="pf-exemplu">{EXEMPLU}</p>
      </div>
    </div>
  );
}

// „Parolele coincid ✓” / „Parolele nu coincid încă.”
export function PotrivireParola({ a, b }: { a: string; b: string }) {
  const r = potrivire(a, b);
  return <div class={'pf-potrivire' + (r.ok === true ? ' pf-ok' : r.ok === false ? ' pf-nu' : '')} aria-live="polite">{r.text}</div>;
}
