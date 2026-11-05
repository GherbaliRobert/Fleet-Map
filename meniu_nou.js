'use strict';
// meniu_nou.js — eticheta „NOU" de lângă un rând din meniu (05.11). Alin: „vreau ca regula în aplicație să apară atunci când
// aducem ceva nou în meniu, dar să dispară după 15 zile de la implementare… de când am făcut noi astea; nu trebuie să mai apară
// NOU acum când intrăm" + „2. da" (la fel pe telefon) + „3. da" (doar eticheta din meniu).
//
// O SINGURĂ listă: un rând NOU în meniu primește aici o intrare cu ziua în care a ajuns pe ratrack.ro (ziua României).
// Eticheta stă ZILE_NOU zile — ziua publicării și încă 14 —, apoi pleacă singură, pe web și pe telefon: serverul trimite în
// /api/me (`meniuNou`) cheile rândurilor încă noi; pagina pune eticheta pe `#nav-<cheie>`, telefonul pe rândul cu aceeași cheie
// (Menu.tsx, `item(…, '<cheie>')`). NU scrie „NOU" de mână în meniu, nici pe web, nici pe telefon.
const insight = require('./insight');

const ZILE_NOU = 15;

// Rândurile, cu ziua în care au apărut pe ratrack.ro. Cele vechi rămân în listă (istoria lor), fără să mai fie noi.
const RANDURI = [
  { cheie: 'insight', de_la: '2026-10-02', ce: 'RA Insight' },
  { cheie: 'incarcare', de_la: '2026-10-12', ce: 'Simulator încărcare' },
];

// Câte zile de calendar au trecut de la ziua publicării până azi, pe zilele României (0 = chiar ziua publicării).
// Miezul nopții vine din regula lui RA Insight (`inceputZiRO`, `perioada`), ca zilele cu ora schimbată să nu încurce socoteala.
function zileDeLa(zi, acum) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(zi || ''));
  if (!m) return null;
  const inceput = insight.inceputZiRO(+m[1], +m[2] - 1, +m[3]);
  const azi = Date.parse(insight.perioada({ period: 'today' }, acum == null ? Date.now() : Number(acum)).from);
  return Math.round((azi - inceput) / 86400000);
}
function eNou(zi, acum) {
  const z = zileDeLa(zi, acum);
  return z != null && z >= 0 && z < ZILE_NOU;
}
// Cheile rândurilor care poartă azi „NOU" (pentru /api/me).
function noi(acum) {
  return RANDURI.filter(function (r) { return eNou(r.de_la, acum); }).map(function (r) { return r.cheie; });
}

module.exports = { ZILE_NOU, RANDURI, zileDeLa, eNou, noi };
