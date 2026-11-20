// Un număr lângă cuvântul lui, pe românește — O SINGURĂ regulă, pentru pagină și pentru server (20.11, Alin: „fă și A și B”).
//   nrDe(1, 'zi', 'zile')   → „1 zi”
//   nrDe(12, 'zi', 'zile')  → „12 zile”
//   nrDe(25, 'zi', 'zile')  → „25 de zile”      (de la 20 în sus se pune „de”…)
//   nrDe(101, 'zi', 'zile') → „101 zile”        (…afară de numerele care se termină în 01–19)
//   nrDe(1000, …)           → „1.000 de zile”   (cifra cu punctul miilor)
//   nrDe(0, …) → „0 zile”; nrDe(2.5, 'litru', 'litri') → „2,5 litri” (zero și zecimalele, fără „de”)
// deNr(n) = doar legătura („ ” sau „ de ”), pentru un text care își scrie singur cifra.
// Pagina o încarcă în <head> (window.nrDe / deNr / nrRo); serverul o cere cu require. Telefonul are copia ei în
// mobile/src/lib/numar.ts, legată de verify_acord.js. NU scrie a doua regulă într-un ecran.
(function (root) {
  'use strict';
  function nrRo(x, zecimale) {
    var v = Number(x);
    if (!isFinite(v)) return String(x);
    var z = zecimale || 0;
    var s = Math.abs(v).toFixed(z), p = s.split('.');
    var intreg = p[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return (v < 0 && Number(s) !== 0 ? '-' : '') + intreg + (p[1] ? ',' + p[1] : '');
  }
  function _intreg(v) { return Math.abs(v - Math.round(v)) < 1e-9; }
  function deNr(n) {
    var v = Number(n);
    if (!isFinite(v) || !_intreg(v)) return ' ';
    var x = Math.abs(Math.round(v));
    if (x < 20) return ' ';
    var r = x % 100;
    return (r >= 1 && r <= 19) ? ' ' : ' de ';
  }
  function _cifra(v) {
    if (_intreg(v)) return nrRo(Math.round(v));
    var z = Math.min(2, (String(v).split('.')[1] || '').length);
    return nrRo(v, z).replace(/,?0+$/, '');
  }
  function nrDe(n, unu, multe) {
    var v = Number(n);
    if (!isFinite(v)) v = 0;
    if (Math.abs(v) === 1) return _cifra(v) + ' ' + unu;
    return _cifra(v) + deNr(v) + multe;
  }
  var api = { nrDe: nrDe, deNr: deNr, nrRo: nrRo };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else { root.RaNumar = api; root.nrDe = nrDe; root.deNr = deNr; root.nrRo = nrRo; }
})(typeof window !== 'undefined' ? window : this);
