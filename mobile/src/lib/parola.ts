// parola.ts — cât de puternică e o parolă și sfaturile, pe telefon (20.11, Alin: „ochiul… și la logare” → „1. DA”). COPIA regulii de pe
// web (public/js/parola.js), legate prin verify_utilizatori.js, care le rulează pe aceleași parole: schimbi una, o schimbi și pe
// cealaltă. Regula SERVERULUI (10 caractere, două feluri, fără parolele foarte cunoscute) rămâne a lui: aici e doar ce vede omul.

export const MIN = 10;   // = PAROLA_MIN din server.js

export type Nivel = '' | 'slaba' | 'acceptabila' | 'buna' | 'puternica';
export type Bife = { lung: boolean; mari: boolean; cifre: boolean; semne: boolean };
export type Forta = { nivel: Nivel; text: string; latime: number; bife: Bife };

export const SFATURI: [keyof Bife, string, string?][] = [
  ['lung', 'Cel puțin ' + MIN + ' caractere', '(obligatoriu)'],
  ['mari', 'Litere mari și mici (A, b)'],
  ['cifre', 'Cifre (0–9)'],
  ['semne', 'Semne (! ? # @ - .)'],
];
export const EXEMPLU = 'Sfat: o frază pe care ți-o amintești ușor, cu o cifră și un semn — de exemplu „Camionul-Verde-7!”. ' +
  'Nu folosi numele tău sau adresa de email.';

export function felurile(p: string) {
  p = String(p || '');
  return { mici: /[a-z]/.test(p), mari: /[A-Z]/.test(p), cifre: /[0-9]/.test(p), semne: /[^A-Za-z0-9]/.test(p) };
}

export function forta(p: string): Forta {
  p = String(p || '');
  const k = felurile(p), n = (k.mici ? 1 : 0) + (k.mari ? 1 : 0) + (k.cifre ? 1 : 0) + (k.semne ? 1 : 0);
  const r: Forta = { nivel: '', text: '—', latime: 0, bife: { lung: p.length >= MIN, mari: k.mari && k.mici, cifre: k.cifre, semne: k.semne } };
  if (!p.length) return r;
  if (p.length < MIN || n < 2) { r.nivel = 'slaba'; r.text = 'Slabă'; r.latime = 25; }
  else if (p.length >= 12 && n >= 4) { r.nivel = 'puternica'; r.text = 'Puternică'; r.latime = 100; }
  else if (n >= 3) { r.nivel = 'buna'; r.text = 'Bună'; r.latime = 70; }
  else { r.nivel = 'acceptabila'; r.text = 'Acceptabilă'; r.latime = 45; }
  return r;
}

export function potrivire(a: string, b: string): { text: string; ok: boolean | null } {
  if (!b) return { text: '', ok: null };
  const ok = String(a) === String(b);
  return { text: ok ? 'Parolele coincid ✓' : 'Parolele nu coincid încă.', ok };
}
