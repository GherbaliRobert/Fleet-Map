// „5 zile”, dar „20 de zile” — COPIA regulii din public/js/numar.js (pagina și serverul), legată de verify_acord.js, care le
// rulează pe aceleași cifre (20.11, Alin: „fă și A și B”): singularul la 1, „de” de la 20 în sus, afară de numerele care se termină în
// 01–19 („101 zile”, „1.000 de zile”); zero și zecimalele fără „de” („0 zile”, „2,5 litri”); cifra cu punctul miilor.
// O singură funcție pentru ecrane; nu scrie încă o copie a regulii într-un ecran.
function _intreg(v: number): boolean { return Math.abs(v - Math.round(v)) < 1e-9; }
export function deNr(n: any): string {
  const v = Number(n);
  if (!isFinite(v) || !_intreg(v)) return ' ';
  const x = Math.abs(Math.round(v));
  if (x < 20) return ' ';
  const r = x % 100;
  return r >= 1 && r <= 19 ? ' ' : ' de ';
}
// „1.240” (punctul miilor), „12,5” (virgula zecimalelor) — ca nrRo din public/js/numar.js, fără Intl (WebView-urile vechi).
export function nrRo(x: any, zecimale = 0): string {
  const v = Number(x);
  if (!Number.isFinite(v)) return String(x);
  const s = Math.abs(v).toFixed(zecimale), p = s.split('.');
  const intreg = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (v < 0 && Number(s) !== 0 ? '-' : '') + intreg + (p[1] ? ',' + p[1] : '');
}
function _cifra(v: number): string {
  if (_intreg(v)) return nrRo(Math.round(v));
  const z = Math.min(2, (String(v).split('.')[1] || '').length);
  return nrRo(v, z).replace(/,?0+$/, '');
}
// nrDe(1, 'zi', 'zile') → „1 zi”; nrDe(5, …) → „5 zile”; nrDe(20, …) → „20 de zile”; nrDe(1000, …) → „1.000 de zile”.
export function nrDe(n: any, unu: string, multe: string): string {
  let v = Number(n);
  if (!isFinite(v)) v = 0;
  if (Math.abs(v) === 1) return _cifra(v) + ' ' + unu;
  return _cifra(v) + deNr(v) + multe;
}
