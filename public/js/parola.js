// parola.js — „ochiul” și sfaturile pentru o parolă puternică, O DATĂ pentru toate paginile web (Alin, 19.11: „să existe «ochi» să
// vizualizezi ce parolă scrii și sugestii pentru a face parola puternică — semne, cifre, litere mari”; 20.11: „să punem ochiul și la
// logare, nu doar la creare” → „1. DA”).
// Unde: „Setează-ți parola” (linkul din email), intrarea în aplicație, „Contul meu” → „Schimbă-ți parola”. Telefonul are copia
// regulii în mobile/src/lib/parola.ts (legate prin verify_utilizatori.js, care le rulează pe aceleași parole).
// Regula SERVERULUI (verificaParola: cel puțin 10 caractere, două feluri, fără parolele foarte cunoscute) rămâne a serverului:
// aici e doar ce vede omul cât scrie. NU scrie a doua socoteală a tăriei în altă parte.
//
// Cum se folosește în pagină:
//   <div class="camp-parola" data-ochi-grup="nou"><input type="password" …><button type="button" class="ochi" …>…</button></div>
//   (casetele cu același `data-ochi-grup` se arată / ascund deodată — parola nouă și confirmarea ei; fără grup, doar caseta lui)
//   <div class="pf"></div> + RaParola.umple(div) → bara de tărie și sfaturile; RaParola.arata(div, parola) la fiecare literă.
(function () {
  'use strict';
  var MIN = 10;   // = PAROLA_MIN din server.js (legate prin verify_utilizatori.js)
  var SFATURI = [
    ['lung', 'Cel puțin ' + MIN + ' caractere', '(obligatoriu)'],
    ['mari', 'Litere mari și mici (A, b)'],
    ['cifre', 'Cifre (0–9)'],
    ['semne', 'Semne (! ? # @ - .)']
  ];
  var EXEMPLU = 'Sfat: o frază pe care ți-o amintești ușor, cu o cifră și un semn — de exemplu „Camionul-Verde-7!”. ' +
    'Nu folosi numele tău sau adresa de email.';

  function felurile(p) {
    p = String(p || '');
    return { mici: /[a-z]/.test(p), mari: /[A-Z]/.test(p), cifre: /[0-9]/.test(p), semne: /[^A-Za-z0-9]/.test(p) };
  }
  // Cât de puternică e parola: { nivel: '' | 'slaba' | 'acceptabila' | 'buna' | 'puternica', text, latime (%), bife }.
  function forta(p) {
    p = String(p || '');
    var k = felurile(p), n = (k.mici ? 1 : 0) + (k.mari ? 1 : 0) + (k.cifre ? 1 : 0) + (k.semne ? 1 : 0);
    var r = { nivel: '', text: '—', latime: 0, bife: { lung: p.length >= MIN, mari: k.mari && k.mici, cifre: k.cifre, semne: k.semne } };
    if (!p.length) return r;
    if (p.length < MIN || n < 2) { r.nivel = 'slaba'; r.text = 'Slabă'; r.latime = 25; }
    else if (p.length >= 12 && n >= 4) { r.nivel = 'puternica'; r.text = 'Puternică'; r.latime = 100; }
    else if (n >= 3) { r.nivel = 'buna'; r.text = 'Bună'; r.latime = 70; }
    else { r.nivel = 'acceptabila'; r.text = 'Acceptabilă'; r.latime = 45; }
    return r;
  }
  // „Parolele coincid ✓” / „Parolele nu coincid încă.” / nimic (a doua casetă e goală).
  function potrivire(a, b) {
    if (!b) return { text: '', ok: null };
    var ok = String(a) === String(b);
    return { text: ok ? 'Parolele coincid ✓' : 'Parolele nu coincid încă.', ok: ok };
  }

  // Bara de tărie + sfaturile (doar texte scrise aici, fără nimic venit de la om).
  function sfaturiHtml() {
    return '<div class="pf-forta" aria-live="polite"><div class="pf-bara"><i></i></div><span class="pf-text">—</span></div>' +
      '<div class="pf-sfaturi"><p class="pf-titlu">Pentru o parolă puternică:</p><ul>' +
      SFATURI.map(function (s) { return '<li data-bifa="' + s[0] + '"><b>✓</b>' + s[1] + (s[2] ? ' <small>' + s[2] + '</small>' : '') + '</li>'; }).join('') +
      '</ul><p class="pf-exemplu">' + EXEMPLU + '</p></div>';
  }
  function umple(cutie) { if (cutie) cutie.innerHTML = sfaturiHtml(); }
  function arata(cutie, p) {
    if (!cutie) return;
    var f = forta(p), ft = cutie.querySelector('.pf-forta');
    if (ft) { ft.className = 'pf-forta' + (f.nivel ? ' pf-' + f.nivel : ''); }
    var bara = cutie.querySelector('.pf-bara i'); if (bara) bara.style.width = f.latime + '%';
    var t = cutie.querySelector('.pf-text'); if (t) t.textContent = f.text;
    Object.keys(f.bife).forEach(function (k) { var li = cutie.querySelector('[data-bifa="' + k + '"]'); if (li) li.classList.toggle('da', !!f.bife[k]); });
  }
  function aratPotrivire(el, a, b) {
    if (!el) return;
    var r = potrivire(a, b);
    el.textContent = r.text;
    el.className = (el.className || '').replace(/\s*pf-(ok|nu)\b/g, '') + (r.ok === true ? ' pf-ok' : r.ok === false ? ' pf-nu' : '');
  }

  // Ochiul: arată / ascunde. Casetele din același grup se schimbă deodată (ca să vezi că le-ai scris la fel).
  function _pune(cutii, vizibil) {
    cutii.forEach(function (c) {
      var i = c.querySelector('input'); if (i) i.type = vizibil ? 'text' : 'password';
      var b = c.querySelector('.ochi');
      if (b) {
        var t = vizibil ? 'Ascunde parola' : 'Arată parola';
        b.classList.toggle('vizibil', vizibil); b.setAttribute('aria-pressed', vizibil ? 'true' : 'false');
        b.setAttribute('aria-label', t); b.title = t;
      }
    });
  }
  function comuta(btn) {
    var cutie = btn && btn.closest ? btn.closest('.camp-parola') : null; if (!cutie) return;
    var grup = cutie.getAttribute('data-ochi-grup');
    var cutii = grup ? Array.prototype.slice.call(document.querySelectorAll('.camp-parola[data-ochi-grup="' + grup + '"]')) : [cutie];
    var inp = cutie.querySelector('input');
    _pune(cutii, !!inp && inp.type === 'password');
  }
  // Ascunde din nou (după intrare, după schimbarea parolei): parola nu rămâne la vedere pe ecran.
  function ascunde(radacina) {
    _pune(Array.prototype.slice.call((radacina || document).querySelectorAll('.camp-parola')), false);
  }
  document.addEventListener('click', function (e) {
    var b = e.target && e.target.closest ? e.target.closest('.camp-parola .ochi') : null;
    if (b) { e.preventDefault(); comuta(b); }
  });

  window.RaParola = { MIN: MIN, SFATURI: SFATURI, EXEMPLU: EXEMPLU, felurile: felurile, forta: forta, potrivire: potrivire,
    sfaturiHtml: sfaturiHtml, umple: umple, arata: arata, aratPotrivire: aratPotrivire, comuta: comuta, ascunde: ascunde };
})();
