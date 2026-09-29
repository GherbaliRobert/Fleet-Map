// „5 zile", dar „20 de zile" — acordul românesc cu numerele, ca `_raxDe` de pe web: fără „de" când ultimele
// două cifre sunt între 1 și 19 (și la zero). Numerele vin de la server și se schimbă, deci „de" se pune din cod.
// O singură funcție pentru ecranele noi; nu scrie încă o copie a regulii într-un ecran.
export function deNr(n: any): string {
  const x = Math.abs(Math.round(Number(n) || 0));
  if (x === 0) return ' ';
  const r = x % 100;
  return r >= 1 && r <= 19 ? ' ' : ' de ';
}
// nrDe(1, 'zi', 'zile') → „1 zi"; nrDe(5, …) → „5 zile"; nrDe(20, …) → „20 de zile".
export function nrDe(n: any, unu: string, multe: string): string {
  const x = Number(n) || 0;
  return Math.abs(x) === 1 ? x + ' ' + unu : x + deNr(x) + multe;
}
