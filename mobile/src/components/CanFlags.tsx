import { useEffect, useState } from 'preact/hooks';
import { Icon } from './Icon';
import { loadCanCatalog, canStateText, canColor } from '../lib/canflags';
import type { CanCatalog, CanFlag } from '../lib/canflags';
import './CanFlags.css';

// ─── Steagurile CAN, ca placute cu iconita ────────────────────────────────────────────────
// Uși, lumini, martori de bord — starea mașinii dintr-o privire, la fel ca panoul CAN din web.
// Numele și iconițele vin din can_flags.js (prin /api/can-flags), NU sunt scrise aici.
// Înainte, în telefon steagurile apăreau doar ca text brut („security_flags.door_front_left") și
// numai pentru super-admin, în lista „Toate semnalele (brut)".
export function CanFlags({ io }: { io: any }) {
  const [cat, setCat] = useState<CanCatalog | null>(null);
  // Placuta atinsa → balonul cu explicatia (cerut de Robert, 26.08: „apesi pe pictograma si iti
  // apare un balon cu informatia"). A doua atingere pe aceeasi placuta il inchide.
  const [ales, setAles] = useState<string | null>(null);
  useEffect(() => { let viu = true; loadCanCatalog().then((c) => { if (viu) setCat(c); }); return () => { viu = false; }; }, []);
  if (!cat) return null;

  // Aplatizăm blocurile decodate exact ca web-ul: _security_flags → _sf_*, _control_flags → _cf_*
  const flat: Record<string, any> = {};
  for (const [k, v] of Object.entries((io && io._security_flags) || {})) flat['_sf_' + k] = v;
  for (const [k, v] of Object.entries((io && io._control_flags) || {})) flat['_cf_' + k] = v;

  const nedecodate = new Set(cat.undecoded || []);
  const areSf = cat.flags.some((f) => f.key.startsWith('_sf_') && flat[f.key] !== undefined);
  const areCf = cat.flags.some((f) => f.key.startsWith('_cf_') && flat[f.key] !== undefined);
  if (!areSf && !areCf) {
    // Mașina are adaptor CAN (trimite cifre) dar nu și cele două semnale de stare — IO 132 și 123.
    // Fără rândul ăsta, secțiunea lipsea pur și simplu și părea că aplicația e stricată. Aceeași
    // regulă ca în panoul din web; textul e ținut la fel intenționat.
    const areCan = Object.keys(io || {}).some((k) => k.indexOf('can_') === 0);
    if (!areCan) return null;
    const brut = (io && (io.can_security_state_flags !== undefined || io.can_control_state_flags !== undefined));
    return (
      <div class="cfm">
        <details class="cfm-g" open>
          <summary><Icon name="alert" size={14} /><b>Stare (uși, lumini, martori de bord)</b></summary>
          <div class="cfm-note">
            {brut
              ? 'Mașina trimite semnalele de stare, dar nu le-am putut desface — anunță-ne, e o problemă de-a noastră, nu a adaptorului.'
              : 'Mașina asta nu trimite semnalele de stare: nici uși, nici lumini, nici martori de bord. Adaptorul ei citește de pe magistrală doar valorile numerice de mai sus. Ține de ce anume suportă adaptorul pe modelul respectiv, nu de aplicație.'}
          </div>
        </details>
      </div>
    );
  }

  const aprinse: { warn: string[]; open: string[] } = { warn: [], open: [] };
  let necitite = 0;

  // Regula (Robert, 27.08): se văd DOAR stările active. Altfel ecranul era un perete de casete
  // stinse, din care nu se distingea ce se întâmplă chiar acum. Excepțiile sunt marcate `mereu` în
  // can_flags.js — frâna de mână, treapta și încuiat/descuiat se arată tot timpul, cu ultima stare
  // primită, fiindcă acolo contează și răspunsul „nu".
  type Placa = { f: CanFlag; aprins: boolean; text: string; necitit: boolean; val?: any };
  const sectiuni = cat.groups.map((g) => {
    const placi: Placa[] = [];
    cat.flags.filter((f) => f.group === g.key).forEach((f) => {
      const val = flat[f.key];
      const lipsa = val === undefined || val === null;
      const necitit = lipsa && nedecodate.has(f.key) &&
        ((f.key.startsWith('_sf_') && areSf) || (f.key.startsWith('_cf_') && areCf));
      if (lipsa && !necitit) return;
      // Treptele P/R/N/D nu apar una câte una — intră în plăcuța „Treapta de viteză".
      if (f.ascuns) return;
      // „Necitit" nu e o stare activă: o numărăm pentru nota de jos, dar nu mai desenăm plăcuța.
      if (necitit) { necitite++; return; }
      if (f.kind === 'code') {
        const pornit = Number(val) > 0;
        if (pornit || f.mereu) placi.push({ f, aprins: pornit, text: 'cod ' + val, necitit: false, val });
        return;
      }
      if (f.kind === 'text') {
        // Valoarea E starea (litera treptei). „Aprins" înseamnă doar că avem ce arăta.
        const are = val !== '' && val !== null && val !== undefined;
        if (are || f.mereu) placi.push({ f, aprins: are, text: are ? String(val) : '—', necitit: false, val });
        return;
      }
      const aprins = !!val;
      if (aprins && (f.kind === 'warn' || f.kind === 'open')) aprinse[f.kind].push(f.label);
      if (!aprins && !f.mereu) return;
      placi.push({ f, aprins, text: canStateText(cat, f, aprins), necitit: false, val });
    });
    return { g, placi };
  }).filter((x) => x.placi.length);
  if (!sectiuni.length) return null;

  const lista = (v: string[]) => (v.length <= 4 ? v.join(', ') : v.slice(0, 4).join(', ') + ' +' + (v.length - 4));

  // Pictograma unei plăcuțe. La treaptă, litera E starea — desenăm caseta cu litera primită.
  const desen = (f: CanFlag, val: any): any => {
    if (f.kind === 'text' && val) {
      const n = 'gear' + String(val).toUpperCase();
      if (n === 'gearP' || n === 'gearR' || n === 'gearN' || n === 'gearD') return n;
    }
    return f.mi;
  };

  return (
    <div class="cfm">
      <div class="cfm-sum">
        {aprinse.warn.length > 0 && (
          <span class="cfm-b b-warn">
            <Icon name="alert" size={13} />{' '}
            {(aprinse.warn.length === 1 ? 'Martor aprins: ' : 'Martori aprinși: ') + lista(aprinse.warn)}
          </span>
        )}
        {aprinse.open.length > 0 && (
          <span class="cfm-b b-open"><Icon name="doorOpen" size={13} /> {'Deschis: ' + lista(aprinse.open)}</span>
        )}
        {aprinse.warn.length === 0 && aprinse.open.length === 0 && (
          <span class="cfm-b b-ok"><Icon name="check" size={13} /> Niciun martor aprins, totul închis</span>
        )}
        <span class="cfm-b b-note">Doar stările active. Frâna de mână, treapta și încuietoarea se văd tot timpul.</span>
      </div>

      {sectiuni.map(({ g, placi }) => {
        const rang: Record<string, number> = { warn: 3, open: 2, on: 1, info: 0, code: 0, text: 0 };
        // Treapta are mereu o valoare; n-o numaram in bulina, altfel grupa ar arata permanent „1 activ".
        const lit = placi.filter((x) => x.aprins && x.f.kind !== 'text');
        const cel = lit.reduce<string | null>((a, x) => (a === null || rang[x.f.kind] > rang[a] ? x.f.kind : a), null);
        return (
          <details class="cfm-g" open key={g.key}>
            <summary>
              <Icon name={g.mi} size={14} />
              <b>{g.label}</b>
              {lit.length > 0 && <span class="cfm-cnt" style={{ background: canColor(cel as any) }}>{lit.length}</span>}
            </summary>
            <div class="cfm-grid">
              {placi.map(({ f, aprins, text, necitit, val }) => (
                <button
                  type="button"
                  class={'cfm-t' + (aprins ? ' lit' : '') + (necitit ? ' nd' : '') + (ales === f.key ? ' sel' : '')}
                  key={f.key}
                  style={aprins ? { '--c': canColor(f.kind) } as any : undefined}
                  onClick={() => setAles(ales === f.key ? null : f.key)}
                >
                  <Icon name={desen(f, val) as any} size={19} sw={1.7} />
                  <span class="cfm-l">{f.label}</span>
                  <span class="cfm-s">{text}</span>
                </button>
              ))}
              {(() => {
                const b = placi.find((x) => x.f.key === ales);
                if (!b) return null;
                return (
                  <div class="cfm-balon" onClick={() => setAles(null)}>
                    <div class="cfm-balon-cap">
                      <Icon name={desen(b.f, b.val) as any} size={20} sw={1.7} color={b.aprins ? canColor(b.f.kind) : 'currentColor'} />
                      <b>{b.f.label}</b>
                      <span class="cfm-balon-st" style={b.aprins ? { color: canColor(b.f.kind) } : undefined}>{b.text}</span>
                    </div>
                    {b.necitit
                      ? <div class="cfm-balon-txt">Adaptorul poate trimite semnalul ăsta, dar încă nu-i știm poziția în mesaj — îl aprindem după ce îl confirmăm pe un vehicul.</div>
                      : b.f.desc ? <div class="cfm-balon-txt">{b.f.desc}</div> : null}
                  </div>
                );
              })()}
            </div>
          </details>
        );
      })}

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
