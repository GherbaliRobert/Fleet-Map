// Catalogul steagurilor CAN — nume pe românește, iconiță și ce înseamnă „aprins".
//
// Sursa e `can_flags.js` de pe server, adus prin `GET /api/can-flags`. Panoul CAN din web citește
// EXACT aceleași date, prin `/js/can-flags.js`. NU scrie aici o listă proprie de etichete: așa au
// apărut, la alte ecrane, denumiri vechi care nu se mai potriveau cu ce zicea aplicația web.
//
// Îl ținem în Preferences, deci după prima descărcare merge și fără semnal. Reîmprospătarea se face
// o singură dată pe pornire, în fundal — catalogul se schimbă la deploy, nu de la un minut la altul.
import { Preferences } from '@capacitor/preferences';
import { Api } from '../api/endpoints';
import type { IconName } from '../components/Icon';

export type CanKind = 'warn' | 'open' | 'on' | 'info' | 'code';
export interface CanFlag {
  key: string; label: string; icon: string; mi: IconName; group: string; kind: CanKind; st?: [string, string];
}
export interface CanGroup { key: string; label: string; icon: string; mi: IconName; }
export interface CanCatalog {
  groups: CanGroup[]; flags: CanFlag[]; kindText: Record<string, [string, string]>; undecoded: string[];
}

const KEY = 'can_flags_v1';
let _cache: CanCatalog | null = null;
let _refresh: Promise<CanCatalog | null> | null = null;

function _valid(c: any): c is CanCatalog {
  return !!c && Array.isArray(c.flags) && c.flags.length > 0 && Array.isArray(c.groups);
}

function _fromServer(): Promise<CanCatalog | null> {
  if (!_refresh) {
    _refresh = Api.canFlags()
      .then(async (fresh) => {
        if (!_valid(fresh)) return _cache;
        _cache = fresh;
        try { await Preferences.set({ key: KEY, value: JSON.stringify(fresh) }); } catch { /* fără stocare → merge din memorie */ }
        return _cache;
      })
      .catch(() => _cache);   // fără semnal → rămâne ce aveam salvat
  }
  return _refresh;
}

/** Catalogul, din memorie → din Preferences → de pe server. `null` doar la prima pornire fără net. */
export async function loadCanCatalog(): Promise<CanCatalog | null> {
  if (_cache) { void _fromServer(); return _cache; }
  try {
    const stored = (await Preferences.get({ key: KEY })).value;
    if (stored) {
      const parsed = JSON.parse(stored);
      if (_valid(parsed)) { _cache = parsed; void _fromServer(); return _cache; }
    }
  } catch { /* stocare coruptă → luăm de pe server */ }
  return await _fromServer();
}

/** Textul stării: „Deschisă" / „Închisă", „Aprins" / „Stins". Aceleași cuvinte ca în web. */
export function canStateText(cat: CanCatalog, f: CanFlag, aprins: boolean): string {
  const per = f.st || cat.kindText[f.kind] || cat.kindText.info || ['Da', 'Nu'];
  return per[aprins ? 0 : 1];
}

/** Culoarea stării aprinse. „info"/„code" rămân neutre: în paleta noastră verdele înseamnă „e bine". */
export function canColor(kind: CanKind): string {
  if (kind === 'warn') return 'var(--red)';
  if (kind === 'open') return 'var(--orange)';
  if (kind === 'on') return 'var(--green)';
  return 'var(--text-primary)';
}
