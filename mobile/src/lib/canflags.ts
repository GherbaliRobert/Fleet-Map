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

export type CanKind = 'warn' | 'open' | 'on' | 'info' | 'code' | 'text';
export interface CanFlag {
  key: string; label: string; icon: string; mi: IconName; group: string; kind: CanKind; st?: [string, string]; desc?: string;
  /** se arata tot timpul, cu ultima stare stiuta (frana de mana, treapta, incuietoarea) */
  mereu?: boolean;
  /** nu se deseneaza singura - valoarea intra in alta placuta (treptele P/R/N/D -> _sf_gear) */
  ascuns?: boolean;
}
export interface CanGroup { key: string; label: string; icon: string; mi: IconName; }
export interface CanCatalog {
  groups: CanGroup[]; flags: CanFlag[]; kindText: Record<string, [string, string]>; undecoded: string[];
  /** ordinea plăcuțelor din banda „Starea mașinii" — vine de la server, ca să nu fie două ordini */
  stateBand?: string[];
}

// v2: catalogul are campuri noi (`mereu`, `ascuns`, treapta ca o singura placuta). Cu cheia veche,
// un telefon care avea deja catalogul salvat ar fi ramas cu cel vechi pana la urmatoarea pornire cu
// semnal - adica exact cu ecranul pe care tocmai l-am schimbat.
const KEY = 'can_flags_v2';
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


/** Se desenează plăcuța? Aceeași regulă ca pe web (can_flags.js → seVede): doar cele APRINSE,
 *  plus cele marcate `mereu` (frâna de mână, treapta, încuietoarea), care se văd și stinse. */
export function canSeVede(f: CanFlag, val: any): boolean {
  if (!f || f.ascuns) return false;
  if (f.mereu) return val !== undefined && val !== null;
  // Un cod e un NUMĂR. Fără el (0, false, lipsă) plăcuța n-are ce spune.
  if (f.kind === 'code') return Number(val) > 0;
  if (f.kind === 'text') return val !== undefined && val !== null && val !== '';
  return !!val;
}

/** Textul stării, pentru toate felurile de plăcuță (inclusiv treapta și codurile magistralei). */
export function canText(cat: CanCatalog, f: CanFlag, val: any): string {
  if (f.kind === 'text') return (val === null || val === undefined || val === '') ? '—' : String(val);
  if (f.kind === 'code') return (val === null || val === undefined || val === '') ? '—' : 'cod ' + val;
  return canStateText(cat, f, !!val);
}

export type Banda = { f: CanFlag; val: any };
export type Benzi = { stare: Banda[]; martori: Banda[]; deschis: Banda[]; active: Banda[] };

/** Cum se așază plăcuțele pe ecran — după cât de mult cer atenție, ca la bordul mașinii:
 *  starea (frână, treaptă, încuietoare, contact, motor) · martori roșii · ce e deschis · ce e pornit.
 *  Ordinea benzii de stare vine de la server (`stateBand`); clasificarea restului e regula de mai jos,
 *  identică cu cea din can_flags.js. O bandă goală nu se desenează. */
export function canBenzi(cat: CanCatalog, flat: Record<string, any>): Benzi {
  const out: Benzi = { stare: [], martori: [], deschis: [], active: [] };
  const peCheie: Record<string, CanFlag> = {};
  cat.flags.forEach((f) => { peCheie[f.key] = f; });
  const puse = new Set<string>();
  (cat.stateBand || []).forEach((k) => {
    const f = peCheie[k]; if (!f) return;
    const v = flat[k];
    if (!canSeVede(f, v)) return;
    out.stare.push({ f, val: v }); puse.add(k);
  });
  cat.flags.forEach((f) => {
    if (puse.has(f.key)) return;
    const v = flat[f.key];
    if (!canSeVede(f, v)) return;
    const unde = f.kind === 'warn' ? 'martori' : f.kind === 'open' ? 'deschis' : 'active';
    out[unde].push({ f, val: v });
  });
  return out;
}

/** Aplatizarea blocurilor decodate, ca pe web: _security_flags → _sf_*, _control_flags → _cf_*. */
export function canFlat(io: any): Record<string, any> {
  const flat: Record<string, any> = {};
  for (const [k, v] of Object.entries((io && io._security_flags) || {})) flat['_sf_' + k] = v;
  for (const [k, v] of Object.entries((io && io._control_flags) || {})) flat['_cf_' + k] = v;
  return flat;
}
