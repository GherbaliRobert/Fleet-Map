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
  useEffect(() => { let viu = true; loadCanCatalog().then((c) => { if (viu) setCat(c); }); return () => { viu = false; }; }, []);
  if (!cat) return null;

  // Aplatizăm blocurile decodate exact ca web-ul: _security_flags → _sf_*, _control_flags → _cf_*
  const flat: Record<string, any> = {};
  for (const [k, v] of Object.entries((io && io._security_flags) || {})) flat['_sf_' + k] = v;
  for (const [k, v] of Object.entries((io && io._control_flags) || {})) flat['_cf_' + k] = v;

  const nedecodate = new Set(cat.undecoded || []);
  const areSf = cat.flags.some((f) => f.key.startsWith('_sf_') && flat[f.key] !== undefined);
  const areCf = cat.flags.some((f) => f.key.startsWith('_cf_') && flat[f.key] !== undefined);
  if (!areSf && !areCf) return null;

  const aprinse: { warn: string[]; open: string[] } = { warn: [], open: [] };
  let necitite = 0;

  type Placa = { f: CanFlag; aprins: boolean; text: string; necitit: boolean };
  const sectiuni = cat.groups.map((g) => {
    const placi: Placa[] = [];
    cat.flags.filter((f) => f.group === g.key).forEach((f) => {
      const val = flat[f.key];
      const lipsa = val === undefined || val === null;
      const necitit = lipsa && nedecodate.has(f.key) &&
        ((f.key.startsWith('_sf_') && areSf) || (f.key.startsWith('_cf_') && areCf));
      if (lipsa && !necitit) return;
      if (necitit) { necitite++; placi.push({ f, aprins: false, text: 'necitit', necitit: true }); return; }
      if (f.kind === 'code') { placi.push({ f, aprins: Number(val) > 0, text: 'cod ' + val, necitit: false }); return; }
      const aprins = !!val;
      if (aprins && (f.kind === 'warn' || f.kind === 'open')) aprinse[f.kind].push(f.label);
      placi.push({ f, aprins, text: canStateText(cat, f, aprins), necitit: false });
    });
    return { g, placi };
  }).filter((x) => x.placi.length);
  if (!sectiuni.length) return null;

  const lista = (v: string[]) => (v.length <= 4 ? v.join(', ') : v.slice(0, 4).join(', ') + ' +' + (v.length - 4));

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
      </div>

      {sectiuni.map(({ g, placi }) => {
        const rang: Record<string, number> = { warn: 3, open: 2, on: 1, info: 0, code: 0 };
        const lit = placi.filter((x) => x.aprins);
        const cel = lit.reduce<string | null>((a, x) => (a === null || rang[x.f.kind] > rang[a] ? x.f.kind : a), null);
        return (
          <details class="cfm-g" open key={g.key}>
            <summary>
              <Icon name={g.mi} size={14} />
              <b>{g.label}</b>
              {lit.length > 0 && <span class="cfm-cnt" style={{ background: canColor(cel as any) }}>{lit.length}</span>}
            </summary>
            <div class="cfm-grid">
              {placi.map(({ f, aprins, text, necitit }) => (
                <div
                  class={'cfm-t' + (aprins ? ' lit' : '') + (necitit ? ' nd' : '')}
                  key={f.key}
                  style={aprins ? { '--c': canColor(f.kind) } as any : undefined}
                >
                  <Icon name={f.mi} size={17} />
                  <span class="cfm-l">{f.label}</span>
                  <span class="cfm-s">{text}</span>
                </div>
              ))}
            </div>
          </details>
        );
      })}

      {necitite > 0 && (
        <div class="cfm-note">
          {necitite} semnale sunt marcate „necitit": adaptorul le poate trimite, dar încă nu știm unde le pune
          în mesaj. Le aprindem după ce le confirmăm pe un vehicul — până atunci preferăm să lipsească decât
          să arate greșit.
        </div>
      )}
    </div>
  );
}
