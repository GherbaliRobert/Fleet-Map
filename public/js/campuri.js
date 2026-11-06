/* Listele derulante desenate de aplicație (Alin, 06.11: „1 da, 2 da").
   În Chrome și Edge, foaia de stil (app.css, blocul „Casetele și listele derulante") pune listele pe „appearance:
   base-select": lista care se deschide e a aplicației (culorile ei, Nunito, bifa verde), nu lista albastră a sistemului.

   Browserul scrie atunci textul ales într-o cutie a lui, care NU se taie: într-o listă îngustă un nume lung ieșea din
   chenar, pe două rânduri, iar săgeata dispărea (măsurat 06.11). De aceea fiecare listă primește înăuntru un buton al nostru:
     <button class="camp-sel"><selectedcontent></selectedcontent><span class="camp-sel-m">…</span></button>
   – <selectedcontent> = textul ales; îl ține browserul la zi (o alegere cu mouse-ul, `value` / `selectedIndex` puse din cod);
   – .camp-sel-m = textele tuturor opțiunilor, ascunse: lista e cât cea mai lungă opțiune, ca lista veche, și nu sare bara
     când alegi altceva (fără ea, o listă fără lățime scrisă se făcea cât textul ales).

   ⚠ Butonul se pune O DATĂ pe listă și se ține minte (`_campSel`). Când codul reface opțiunile cu innerHTML, butonul e scos
   odată cu ele, iar Chrome nu mai umple un <selectedcontent> NOU pus în aceeași listă (rămâne gol); ACELAȘI buton, pus la
   loc, merge. Măsurat 06.11, Chromium 141.
   Pe browserele fără „base-select" (Safari, Firefox) nu face nimic: lista care se deschide rămâne a sistemului. */
(function () {
  'use strict';
  if (!(window.CSS && CSS.supports && CSS.supports('appearance', 'base-select')) || !window.MutationObserver || !window.Set) return;

  // Aceleași liste pe care foaia de stil le pune pe „base-select" (fără cele cu mai multe rânduri și fără două ale altora).
  function potrivita(s) {
    return !s.multiple && !(s.size > 1) && !s.classList.contains('ss-native') && !s.classList.contains('flatpickr-monthDropdown-months');
  }

  function masura(s, b) {
    var m = b.lastElementChild;
    if (!m || m.className !== 'camp-sel-m') return;
    var t = [];
    for (var i = 0; i < s.options.length; i++) t.push(s.options[i].label);
    var v = t.join('\n');
    if (m.textContent !== v) m.textContent = v;
  }

  function pune(s) {
    if (!s.isConnected || !potrivita(s)) return;
    var f = s.firstElementChild, b = s._campSel;
    if (!b) {
      if (f && f.tagName === 'BUTTON') {
        b = s._campSel = f;                       // o listă copiată (cloneNode) își are deja butonul
      } else {
        b = document.createElement('button');
        b.type = 'button';
        b.className = 'camp-sel';
        b.appendChild(document.createElement('selectedcontent'));
        var m = document.createElement('span');
        m.className = 'camp-sel-m';
        m.setAttribute('aria-hidden', 'true');
        b.appendChild(m);
        s._campSel = b;
        s.insertBefore(b, s.firstChild);
      }
    } else if (f !== b) {
      if (f && f.tagName === 'BUTTON') s.replaceChild(b, f); else s.insertBefore(b, s.firstChild);
    }
    masura(s, b);
  }

  var deFacut = new Set();
  function strange(n) {
    if (!n || n.nodeType !== 1) return;
    var tag = n.tagName;
    if (tag === 'SELECT') deFacut.add(n);
    else if (tag === 'OPTION' || tag === 'OPTGROUP') { var s = n.closest('select'); if (s) deFacut.add(s); }
    else if (n.firstElementChild) {
      var l = n.getElementsByTagName('select');
      for (var i = 0; i < l.length; i++) deFacut.add(l[i]);
    }
  }
  function fa() { deFacut.forEach(pune); deFacut.clear(); }

  new MutationObserver(function (rec) {
    for (var i = 0; i < rec.length; i++) {
      var t = rec[i].target;
      if (t.nodeType === 1 && (t.tagName === 'SELECT' || t.tagName === 'OPTION' || t.tagName === 'OPTGROUP')) strange(t);
      var a = rec[i].addedNodes;
      for (var j = 0; j < a.length; j++) strange(a[j]);
    }
    fa();
  }).observe(document.documentElement, { childList: true, subtree: true });

  strange(document.documentElement); fa();
  document.addEventListener('DOMContentLoaded', function () { strange(document.documentElement); fa(); });
})();
