/* RA Insight — telefonul de prezentare (16.11; Alin: „1. A, 2. închis, 3. da, cu comutator Basic / Pro / Business, 4. da, 5. da”,
   la macheta https://claude.ai/artifact/WZp8wrbHtGe65SgywGATGt — „exact așa animat ca în machetă”).

   UN SINGUR fișier, folosit în două locuri:
     - prima pagină: telefonul din primul ecran (patru întrebări în aceeași discuție, cu butoanele de sub el), bucățile de
       ecran din secțiunea RA Insight (starea finală a fiecărei întrebări) și telefonul pachetelor, cu comutatorul Start · Basic ·
       Pro · Business (cine întreabă, câte întrebări are, „Sursă externă”) — UN telefon din 19.11 (Alin: „am prea multe telefoane
       pe pagină”); /pachete-ra-insight n-are telefoane din 18.11;
     - aplicația, „Vezi pachetele”, la firmele de pe Start: același telefon, cu Basic / Pro / Business.
   NU scrie a doua variantă în pagină: pune un <div data-ri-demo="…"> și cheamă RaInsightDemo.porneste(container) dacă e pus după
   încărcare (aplicația).

   Răspunsurile au FORMA pe care o dă aplicația azi; textele care vin din cod (cartonașul alertei, raportul, insignele, „Cifrele le-am
   luat din rapoarte.", butoanele de sub casetă, pachetele) sunt legate de el în verify_ra_insight_demo.js, iar întrebările trec prin
   regulile adevărate ale aplicației (răspunsul pe loc, raportul cerut, alerta, analiza). Mașinile, oamenii și cifrele sunt inventate;
   zilele se socotesc față de azi, pe ora României, ca pagina să nu îmbătrânească.
   Se mișcă doar cât e pe ecran; cine a cerut „mai puțină mișcare” vede răspunsurile gata scrise. */
(function () {
  'use strict';
  if (window.RaInsightDemo) return;
  var MISCARE = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var TZ = 'Europe/Bucharest', ZI = 864e5;
  var LUNI = ['ianuarie', 'februarie', 'martie', 'aprilie', 'mai', 'iunie', 'iulie', 'august', 'septembrie', 'octombrie', 'noiembrie', 'decembrie'];
  var _fz = null;
  function parti(ms) {
    if (!_fz) _fz = new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, year: 'numeric', month: 'numeric', day: 'numeric' });
    var o = {};
    _fz.formatToParts(new Date(ms)).forEach(function (p) { o[p.type] = p.value; });
    return { y: +o.year, m0: +o.month - 1, d: +o.day };
  }
  function doi(n) { return (n < 10 ? '0' : '') + n; }
  // „09.11” — cu anul doar când ziua e în alt an decât azi (ca _zi din propuneri.js și zz din ramuri.js). `faraAn` = „până pe 23.11”
  // de sub raportul cerut (cartonasRaport scrie mereu fără an).
  function zz(ms, acum, faraAn) { var p = parti(ms); return doi(p.d) + '.' + doi(p.m0 + 1) + (!faraAn && acum != null && parti(acum).y !== p.y ? '.' + p.y : ''); }
  function zzan(ms) { var p = parti(ms); return doi(p.d) + '.' + doi(p.m0 + 1) + '.' + p.y; }
  var ORA = '10:24';

  // ── Pachetele plătite (copia lui pachete.js: titlu, pentru cine, conturi, întrebări; „Sursă externă” din sursa_externa.js) ──
  var PACHETE = {
    basic: { nume: 'Basic', titlu: 'Întreabă orice despre flota ta.', pentru: 'Pentru patron și încă un om.', conturi: '2', intrebari: '200 pe lună', sursa: 10,
      cine: 'Andrei', rol: 'patronul', contor: ['198 din 200', '197 din 200'], sursaRamase: 7, sc: 'dece' },
    pro: { nume: 'Pro', titlu: 'Toată echipa întreabă: până la 5 oameni.', pentru: 'Pentru firme cu dispecerat.', conturi: 'până la 5', intrebari: '600 pe lună', sursa: 30,
      cine: 'Maria', rol: 'dispecera', contor: ['îți rămân 92', 'îți rămân 91'], sursaRamase: 24, sc: 'soferi' },
    business: { nume: 'Business', titlu: 'Oricâți oameni, 1.000 de întrebări.', pentru: 'Pentru flote mari, cu mai multe echipe.', conturi: 'nelimitate', intrebari: '1.000 pe lună', sursa: 50,
      cine: 'Radu', rol: 'șef de echipă', contor: ['îți rămân 184', 'îți rămân 183'], sursaRamase: 47, sc: 'ore' }
  };
  var PLANURI = ['basic', 'pro', 'business'];
  var START = { cine: 'Andrei', contor: ['37 din 50', '36 din 50'] };

  // Butoanele de sub casetă (CARDURI / CARDURI_REGULI din pagină) și textul din casetă.
  var CHIPS = [['fa-triangle-exclamation', 'Ce probleme are flota?'], ['fa-route', 'Km săptămâna trecută'], ['fa-file-signature', 'Ce acte expiră?']];
  var CHIPS_START = [['fa-clock-rotate-left', 'Ce a făcut flota ieri?'], ['fa-route', 'Km săptămâna trecută'], ['fa-file-signature', 'Ce acte expiră?']];
  var LOC = 'Scrie o întrebare sau cere un raport…', LOC_START = 'Apasă „+” sau scrie o întrebare…';

  // ── Textele, cu zilele socotite față de `acum` ──
  function texte(acum) {
    var a = parti(acum), luna = LUNI[a.m0], lunaAnt = LUNI[(a.m0 + 11) % 12];
    var ok = function (t) { return '<div class="ri-ok"><i class="fa-solid fa-circle-check"></i> ' + t + '</div>'; };
    var pas = function (ic, t, cls) { return '<span class="ri-pas' + (cls ? ' ' + cls : '') + '"><i class="fa-solid ' + ic + '"></i>' + t + '</span>'; };
    return {
      azi: [
        { st: 'r', t: '<b>B 77 TIR · Iveco Stralis</b> nu transmite de 3 h.' },
        { st: 'w', t: 'Urmează: ITP la <b>B 31 LOG · Dacia Logan</b> — expiră pe ' + zz(acum + 12 * ZI, acum) + ' — peste 12 zile.' },
        { st: 'g', t: 'Ieri: <b>1.240 km</b>, 7 mașini au mers, una a stat. Cea mai activă: <b>B 77 TIR · Iveco Stralis</b>, 412 km.' }
      ],
      sc: {
        unde: { q: 'Unde e B 204 RAT acum?', fel: 'instant', det: 'din datele de acum', gand: 900,
          corp: '<div class="ri-h">Unde e acum</div><p><b>VW Caddy</b> (B 204 RAT)</p><div class="ri-li">Calea Victoriei 155, București</div><div class="ri-li">În mișcare, 54 km/h</div>' },
        dece: { q: 'De ce a crescut consumul la Caddy luna asta?', fel: 'ai', det: '1 întrebare', dur: '7 secunde', gand: 2300, numara: true,
          tit: 'B 204 RAT · VW Caddy · ' + luna + ' ' + a.y + ' (până azi) · Consum carburant',
          corp: '<div class="ri-h">Ce s-a întâmplat</div><p>Caddy-ul a consumat <b>8,4 l/100 km</b> de la 1 ' + luna + ' până azi, față de <b>7,1</b> în aceleași zile din ' + lunaAnt + ' (+18%).</p>' +
            '<div class="ri-h">De ce</div><div class="ri-li">A stat cu motorul pornit pe loc <b>6 h 20 min</b> (în ' + lunaAnt + ': 2 h 5 min).</div><div class="ri-li">A mers <b>41 km</b> peste 90 km/h (în ' + lunaAnt + ': 9 km).</div>' +
            '<div class="ri-h">Ce poți face</div><div class="ri-li">Vorbește cu Mihai despre ralanti și viteză; în RA Drive apeși „Am vorbit cu el”.</div><div class="ri-li">Pune o alertă de viteză: scrie-mi pragul și ți-o pregătesc.</div>',
          dupa: ok('Cifrele le-am luat din rapoarte.') + '<div class="ri-surse">' + pas('fa-file-lines', 'Consum carburant') + pas('fa-file-lines', 'Ralanti') + '</div>' },
        raport: { q: 'Fă-mi și foaia de parcurs pe ieri', qSingur: 'Fă-mi foaia de parcurs pentru B 204 RAT, ieri', fel: 'instant', det: 'din rapoarte', gand: 1300,
          dupa: '<div class="ri-rap"><div class="ri-rap-h"><span class="ri-ic"><i class="fa-solid fa-file-lines"></i></span><span>Foaie de parcurs · B 204 RAT · VW Caddy · ieri</span></div>' +
            '<div class="ri-kpi"><span><span class="ri-l">Curse</span><b>6</b></span><span><span class="ri-l">Distanță totală (km)</span><b>184,3</b></span><span><span class="ri-l">Durată totală</span><b>4 h 12 min</b></span></div>' +
            '<div class="ri-btns">' + pas('fa-up-right-from-square', 'Deschide raportul') + pas('fa-file-excel', 'Descarcă Excel') + '</div>' +
            '<div class="ri-mic">E și în Istoric rapoarte, până pe ' + zz(acum + 7 * ZI, acum, true) + '.</div></div>' },
        alerta: { q: 'Anunță-mă când B 204 RAT trece de 120 km/h', fel: 'instant', det: 'propunere', gand: 1000, faraAct: true,
          corp: '<p>Am pregătit alerta. Uite ce pun — apeși <b>Da</b> și o pornesc.</p>',
          dupa: '<div class="ri-prop"><div class="ri-prop-h"><span class="ri-ic"><i class="fa-solid fa-bell"></i></span><span class="ri-prop-t">Pun o alertă de viteză</span></div>' +
            '<div class="ri-sch"><div><span class="ri-l">Ce urmăresc</span><b>Depășire viteză</b></div><div><span class="ri-l">Peste</span>120 km/h</div><div><span class="ri-l">Pe</span>B 204 RAT · VW Caddy</div><div><span class="ri-l">Numele alertei</span>Viteză peste 120 — B 204 RAT</div></div>' +
            '<div class="ri-dov"><div class="ri-dov-t">Din ultimele 30 de zile</div>' +
            '<div><i class="fa-solid fa-triangle-exclamation ri-wi"></i><span>Ar fi sunat de 3 ori. Cea mai mare viteză: 134 km/h, pe ' + zz(acum - 7 * ZI, acum) + ', la 14:22.</span></div>' +
            '<div><i class="fa-solid fa-circle-info ri-ii"></i><span>Ca toate alertele de viteză din aplicație, sună cu 10 km/h peste prag: când trece de 130 km/h.</span></div>' +
            '<div><i class="fa-solid fa-circle-info ri-ii"></i><span>Ajunge la cei care primesc azi alertele firmei, ca orice altă alertă.</span></div></div>' +
            '<div class="ri-btns" data-rol="da">' + pas('fa-check', 'Da, pune alerta', 'ri-da') + pas('fa-pen', 'Schimbă') + pas('fa-xmark', 'Nu') + '</div>' +
            '<div class="ri-sub">Se face exact ca din Management › Alerte › Adaugă regulă, cu drepturile tale. În jurnal: „Andrei, prin RA Insight”. O oprești oricând din lista de alerte; se poate anula în următoarele 10 minute.</div></div>',
          apasat: 'Ai apăsat Da · ' + ORA,
          gata: '<div class="ri-gata"><div class="ri-gata-t"><i class="fa-solid fa-circle-check"></i><span>Gata. Alerta <b>Viteză peste 120 — B 204 RAT</b> e pornită de azi, ' + ORA + '.</span></div>' +
            '<div class="ri-btns">' + pas('fa-rotate-left', 'Anulează · mai ai 9:59', 'ri-anul') + pas('fa-bell', 'Vezi alertele') + '</div>' +
            '<div class="ri-sub">În jurnal: „Andrei, prin RA Insight: alerta Viteză peste 120 — B 204 RAT” · ' + zzan(acum) + ', ' + ORA + '. O oprești oricând din Management › Alerte.</div></div>' },
        ieri: { q: 'Ce a făcut flota ieri?', fel: 'instant', det: '1 răspuns', gand: 900, chip: 0, numara: true,
          corp: '<p>Flota — ieri: <b>1.240 km</b>; au mers 7 din 8 mașini, ralanti în total 3 h 10 min.</p>',
          dupa: '<table class="ri-tab"><thead><tr><th>Mașina</th><th>Km</th><th>Zile de mers</th><th>În mers</th></tr></thead><tbody>' +
            '<tr><td>B 77 TIR</td><td>412</td><td>1</td><td>5 h 40 min</td></tr><tr><td>B 31 LOG</td><td>268</td><td>1</td><td>3 h 55 min</td></tr>' +
            '<tr><td>B 204 RAT</td><td>184</td><td>1</td><td>4 h 12 min</td></tr><tr><td>B 18 VAN</td><td>151</td><td>1</td><td>3 h 5 min</td></tr></tbody></table>' },
        soferi: { q: 'Care șofer a mers cel mai mult peste 90 km/h săptămâna trecută?', fel: 'ai', det: '1 întrebare', dur: '6 secunde', gand: 2100, numara: true,
          corp: '<p><b>Ion Popa</b> (B 18 VAN) a mers cel mai mult peste 90 km/h săptămâna trecută: <b>126 km</b>, în 4 zile. Urmează <b>Mihai Ionescu</b> (B 204 RAT), cu <b>41 km</b>.</p>' +
            '<p>Ceilalți șoferi au sub 10 km fiecare.</p>',
          dupa: ok('Cifrele le-am luat din rapoarte.') },
        ore: { q: 'Câte ore poate conduce un șofer de camion într-o săptămână?', fel: 'ai', det: '1 întrebare · sursă externă, 1 căutare', dur: '9 secunde', gand: 2600, numara: true, sursa: true,
          corp: '<p>Cel mult <b>56 de ore</b> într-o săptămână și <b>90 de ore</b> în două săptămâni la rând. Pe zi, <b>9 ore</b>; de două ori pe săptămână, 10 ore.</p>' +
            '<p>După 4 ore și jumătate de condus urmează o pauză de cel puțin 45 de minute.</p>',
          dupa: '<div class="ri-se"><div class="ri-se-h"><i class="fa-solid fa-globe"></i><span>Surse de pe internet</span><span class="ri-se-c">Căutat pe internet la ' + ORA + ' · 1 căutare</span></div>' +
            '<ol class="ri-se-l"><li><span class="ri-se-a">Regulamentul (CE) nr. 561/2006</span><span class="ri-se-s">eur-lex.europa.eu</span></li></ol>' +
            '<div class="ri-se-q">Ce am căutat: „ore de condus șofer camion pe săptămână, regulamentul 561”</div></div>' + ok('Cifrele le-am luat din sursele de mai sus.') }
      }
    };
  }
  var ORDINE = ['unde', 'dece', 'raport', 'alerta'];

  function el(tag, cls, html) { var e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; return e; }
  function asteapta(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

  // Antetul răspunsului, ca în aplicație: „RA Insight”, eticheta (INSTANT cu fulger / ANALIZĂ cu steluțe), detaliul, durata.
  function antet(s) {
    var c = el('div', 'ri-cap');
    c.appendChild(el('span', 'ri-nm', 'RA Insight'));
    c.appendChild(el('span', 'ri-et ' + (s.fel === 'ai' ? 'ri-ai' : 'ri-instant'), s.fel === 'ai' ? '<i class="fa-solid fa-wand-magic-sparkles"></i>Analiză' : '<i class="fa-solid fa-bolt"></i>Instant'));
    if (s.det) c.appendChild(el('span', 'ri-det', s.det + (s.dur ? ' · ' + s.dur : '')));
    return c;
  }
  // Cuvintele se aprind pe rând (ca _chatScrieTreptat din aplicație): fiecare cuvânt devine un <span class="ri-w">.
  function cuvinte(nod) {
    var l = [];
    (function umbla(n) {
      Array.prototype.slice.call(n.childNodes).forEach(function (k) {
        if (k.nodeType === 3) {
          var f = document.createDocumentFragment();
          k.textContent.split(/(\s+)/).forEach(function (p) {
            if (!p) return;
            if (/^\s+$/.test(p)) f.appendChild(document.createTextNode(p));
            else { var s = el('span', 'ri-w'); s.textContent = p; f.appendChild(s); l.push(s); }
          });
          k.parentNode.replaceChild(f, k);
        } else if (k.nodeType === 1 && !/^(I|SVG)$/i.test(k.tagName)) umbla(k);
      });
    })(nod);
    return l;
  }
  function raspuns(s, gata) {
    var row = el('div', 'ri-pa'), av = el('div', 'ri-av', '<i class="fa-solid fa-wand-magic-sparkles"></i>');
    row.appendChild(av);
    var b = el('div', 'ri-bub'); row.appendChild(b);
    b.appendChild(antet(s));
    if (s.tit) b.appendChild(el('div', 'ri-tit', s.tit));
    var corp = el('div', 'ri-corp', s.corp || ''); b.appendChild(corp);
    if (s.dupa) b.appendChild(el('div', 'ri-dupa', s.dupa));
    if (!s.faraAct) b.appendChild(el('div', 'ri-act ri-dupa', '<i class="fa-regular fa-copy"></i><i class="fa-regular fa-thumbs-up"></i><i class="fa-regular fa-thumbs-down"></i>'));
    if (gata) b.querySelectorAll('.ri-dupa').forEach(function (x) { x.classList.add('ri-v'); });
    return { row: row, av: av, bub: b, corp: corp };
  }
  // După „Da”: cartonașul se închide („Ai apăsat Da · 10:24”), iar dedesubt vine „Gata”, cu „Anulează” (10 minute) și jurnalul.
  function puneGata(T, r, s) {
    var dz = r.bub.querySelector('[data-rol="da"]'); if (!dz) return;
    var prop = r.bub.querySelector('.ri-prop');
    dz.parentNode.removeChild(dz);
    var sub = prop.querySelector('.ri-sub'); if (sub) sub.parentNode.removeChild(sub);
    prop.classList.add('ri-inchis');
    prop.querySelector('.ri-prop-h').appendChild(el('span', 'ri-prop-st', '<i class="fa-solid fa-check"></i>' + s.apasat));
    var g = el('div', null, s.gata).firstChild; if (MISCARE) g.classList.add('ri-intra');
    prop.parentNode.insertBefore(g, prop.nextSibling);
    if (T) T.ceas(g.querySelector('.ri-anul'));
  }

  // ── Un telefon: ecranul gol (salut, casetă, butoane, „Azi la tine”) și discuția ──
  function Telefon(gazda, o) {
    this.o = o || {}; this.gen = 0; this.vazut = !('IntersectionObserver' in window); this.trezeste = null; this._ceas = null;
    this.cine = this.o.cine || 'Andrei'; this.contor = this.o.contor || null; this.sursa = this.o.sursa || null;
    var scr = el('div', 'ri-scr');
    scr.innerHTML = '<div class="ri-isl"></div>' +
      '<div class="ri-st"><span>' + ORA + '</span><span class="ri-st-ic"><i class="fa-solid fa-signal"></i><i class="fa-solid fa-wifi"></i><i class="fa-solid fa-battery-three-quarters"></i></span></div>' +
      '<div class="ri-bar"><span class="ri-b"><i class="fa-solid fa-bars"></i></span><span class="ri-bt">RA Insight</span><span class="ri-b"><i class="fa-solid fa-ellipsis"></i></span></div>' +
      '<div class="ri-corp-tel"><div class="ri-gol"></div><div class="ri-msgs ri-ascuns"></div></div>' +
      '<div class="ri-dock ri-ascuns"></div><div class="ri-home"></div>';
    gazda.appendChild(scr);
    gazda._riTel = this;
    this.gazda = gazda; this.scr = scr;
    this.gol = scr.querySelector('.ri-gol'); this.msgs = scr.querySelector('.ri-msgs'); this.dock = scr.querySelector('.ri-dock');
    this.T = texte(Date.now());
    this.deseneazaGol();
    var self = this;
    if ('IntersectionObserver' in window) {
      this.io = new IntersectionObserver(function (e) {
        self.vazut = e[e.length - 1].isIntersecting;
        if (self.vazut && self.trezeste) { var t = self.trezeste; self.trezeste = null; t(); }
      }, { threshold: 0.35 });
      this.io.observe(gazda);
    }
  }
  Telefon.prototype.caseta = function () {
    var loc = this.o.start ? LOC_START : LOC;
    var sursa = this.sursa ? '<span class="ri-sursa' + (this.sursa.on ? ' ri-on' : '') + '" title="Sursă externă"><i class="fa-solid fa-globe"></i><span class="ri-sursa-nr">' + (this.sursa.on ? this.sursa.nr : '') + '</span></span>' : '';
    var cnt = this.contor ? '<span class="ri-cnt">' + this.contor + '</span>' : '';
    return '<div class="ri-cas"><div class="ri-tx"><span class="ri-loc">' + loc + '</span></div><div class="ri-un"><span class="ri-plus"><i class="fa-solid fa-plus"></i></span>' + sursa + cnt +
      '<span class="ri-trim"><i class="fa-solid fa-arrow-up"></i></span></div></div>';
  };
  Telefon.prototype.opresteCeas = function () { if (this._ceas) { clearInterval(this._ceas); this._ceas = null; } };
  // „Anulează · mai ai 9:59”, care scade cât stă pe ecran (ca ceasAnulare din aplicație).
  Telefon.prototype.ceas = function (b) {
    this.opresteCeas();
    if (!b || !MISCARE) return;
    var t = b.lastChild, ramas = 599, self = this;
    this._ceas = setInterval(function () {
      if (!b.isConnected) { self.opresteCeas(); return; }
      if (!self.vazut) return;
      ramas = Math.max(0, ramas - 1);
      t.textContent = 'Anulează · mai ai ' + Math.floor(ramas / 60) + ':' + doi(ramas % 60);
    }, 1000);
  };
  Telefon.prototype.deseneazaGol = function () {
    this.opresteCeas();
    this.T = texte(Date.now());
    var chips = this.o.start ? CHIPS_START : CHIPS;
    this.gol.innerHTML = '<div class="ri-sal">Salut, ' + this.cine + '! Cu ce te pot ajuta?</div>' + this.caseta() +
      '<div class="ri-chips">' + chips.map(function (c) { return '<span class="ri-chip"><span class="ri-ic"><i class="fa-solid ' + c[0] + '"></i></span>' + c[1] + '</span>'; }).join('') + '</div>' +
      '<div class="ri-azi"><div class="ri-azi-cp"><b>Azi la tine</b><span>2 de văzut</span></div>' +
      this.T.azi.map(function (x) { return '<div class="ri-azi-r"><span class="ri-azi-st ri-st-' + x.st + '"></span><span>' + x.t + '</span><span class="ri-azi-sg"><i class="fa-solid fa-chevron-right"></i></span></div>'; }).join('') + '</div>';
    this.dock.innerHTML = this.caseta();
    this.gol.classList.remove('ri-ascuns'); this.msgs.classList.add('ri-ascuns'); this.dock.classList.add('ri-ascuns');
    this.msgs.innerHTML = '';
    this.inConv = false;
  };
  Telefon.prototype.laDiscutie = function () {
    if (this.inConv) return;
    this.gol.classList.add('ri-ascuns'); this.msgs.classList.remove('ri-ascuns'); this.dock.classList.remove('ri-ascuns'); this.inConv = true;
  };
  Telefon.prototype.jos = function (lin) { var m = this.msgs; if (lin && MISCARE && m.scrollTo) m.scrollTo({ top: m.scrollHeight, behavior: 'smooth' }); else m.scrollTop = m.scrollHeight; };
  Telefon.prototype.viu = function (g) { return g === this.gen && this.scr.isConnected; };
  Telefon.prototype.pauza = function (g, ms) {
    var self = this;
    return asteapta(ms).then(function () {
      if (!self.viu(g)) return false;
      if (self.vazut) return true;
      return new Promise(function (r) { self.trezeste = function () { r(self.viu(g)); }; });
    });
  };
  Telefon.prototype.opreste = function () {
    this.gen++; this.opresteCeas();
    if (this.io) this.io.disconnect();
    if (this.trezeste) { var t = this.trezeste; this.trezeste = null; t(); }
  };
  Telefon.prototype.atinge = function (nod) {
    if (!nod || !MISCARE) return;
    var r = nod.getBoundingClientRect(), s = this.scr.getBoundingClientRect();
    var a = el('span', 'ri-atinge'); a.style.left = (r.left - s.left + r.width / 2) + 'px'; a.style.top = (r.top - s.top + r.height / 2) + 'px';
    this.scr.appendChild(a); setTimeout(function () { if (a.parentNode) a.parentNode.removeChild(a); }, 600);
  };
  // Contorul de lângă săgeată și „Sursă externă”: aceleași în caseta din mijloc și în cea de jos.
  Telefon.prototype.puneContor = function (t) {
    this.contor = t;
    this.scr.querySelectorAll('.ri-cnt').forEach(function (c) { c.textContent = t; });
  };
  Telefon.prototype.puneSursa = function (on, nr) {
    if (!this.sursa) return;
    this.sursa.on = on; if (nr != null) this.sursa.nr = nr;
    var self = this;
    this.scr.querySelectorAll('.ri-sursa').forEach(function (b) { b.classList.toggle('ri-on', on); b.querySelector('.ri-sursa-nr').textContent = on ? self.sursa.nr : ''; });
  };
  // Scrie întrebarea în caseta care se vede (în mijloc, pe ecranul gol, sau jos, în discuție), apoi „trimite”.
  Telefon.prototype.scrie = async function (g, text) {
    var cas = (this.inConv ? this.dock : this.gol).querySelector('.ri-cas');
    var tx = cas.querySelector('.ri-tx'), tr = cas.querySelector('.ri-trim');
    cas.classList.add('ri-scrie'); tx.innerHTML = '';
    var span = el('span'); tx.appendChild(span); tx.appendChild(el('span', 'ri-cur'));
    for (var i = 1; i <= text.length; i++) {
      span.textContent = text.slice(0, i);
      if (i === 1) tr.classList.add('ri-plin');
      if (!(await this.pauza(g, 34 + (text[i - 1] === ' ' ? 40 : 0)))) return false;
    }
    if (!(await this.pauza(g, 380))) return false;
    tr.classList.add('ri-apasat'); this.atinge(tr);
    if (!(await this.pauza(g, 160))) return false;
    tr.classList.remove('ri-apasat', 'ri-plin'); cas.classList.remove('ri-scrie');
    tx.innerHTML = '<span class="ri-loc">' + (this.o.start ? LOC_START : LOC) + '</span>';
    return true;
  };
  Telefon.prototype.intreaba = function (text) {
    this.laDiscutie();
    var u = el('div', 'ri-pu' + (MISCARE ? ' ri-intra' : '')); u.textContent = text; this.msgs.appendChild(u); this.jos(true);
  };
  Telefon.prototype.raspunde = async function (g, s) {
    var r = raspuns(s, false);
    var gand = el('div', 'ri-gand', 'Mă gândesc…');
    r.av.classList.add('ri-lucreaza');
    var tmp = el('div', 'ri-pa ri-intra'); tmp.appendChild(r.av); var bg = el('div'); bg.appendChild(gand); tmp.appendChild(bg);
    this.msgs.appendChild(tmp); this.jos(true);
    if (!(await this.pauza(g, s.gand))) return null;
    r.av.classList.remove('ri-lucreaza');
    tmp.parentNode.replaceChild(r.row, tmp); r.row.insertBefore(r.av, r.row.firstChild);
    if (s.numara && this.o.contorDupa) this.puneContor(this.o.contorDupa);
    if (s.sursa && this.sursa) this.puneSursa(true, (this.sursa.ramase - 1) + ' din ' + this.sursa.total);
    var w = cuvinte(r.corp);
    var pas = w.length ? Math.max(14, Math.min(55, 900 / w.length)) : 0;
    for (var i = 0; i < w.length; i++) { w[i].classList.add('ri-v'); if (i % 6 === 5) this.jos(false); if (!(await this.pauza(g, pas))) return null; }
    var dupa = r.bub.querySelectorAll('.ri-dupa');
    for (var j = 0; j < dupa.length; j++) { dupa[j].classList.add('ri-v'); this.jos(true); if (!(await this.pauza(g, 220))) return null; }
    this.jos(true);
    return r;
  };
  Telefon.prototype.joacaUna = async function (g, cheie, singur) {
    var s = this.T.sc[cheie], q = singur && s.qSingur ? s.qSingur : s.q;
    if (s.chip != null && !this.inConv) {
      var ch = this.gol.querySelectorAll('.ri-chip')[s.chip];
      if (!(await this.pauza(g, 900))) return false;
      ch.classList.add('ri-apasat'); this.atinge(ch);
      if (!(await this.pauza(g, 260))) return false;
      ch.classList.remove('ri-apasat');
    } else {
      if (s.sursa && this.sursa) {
        // „Sursă externă”: omul o pornește, apoi scrie (butonul se face albastru și arată câte au rămas).
        if (!(await this.pauza(g, 500))) return false;
        var sb = (this.inConv ? this.dock : this.gol).querySelector('.ri-sursa');
        this.atinge(sb); this.puneSursa(true, this.sursa.ramase + ' din ' + this.sursa.total);
        if (!(await this.pauza(g, 450))) return false;
      }
      if (!(await this.scrie(g, q))) return false;
    }
    this.intreaba(q);
    if (!(await this.pauza(g, 350))) return false;
    var r = await this.raspunde(g, s);
    if (!r) return false;
    if (s.gata) {
      if (!(await this.pauza(g, 1900))) return false;
      var da = r.bub.querySelector('.ri-da'); if (da) { da.classList.add('ri-apasat'); this.atinge(da); }
      if (!(await this.pauza(g, 260))) return false;
      puneGata(this, r, s); this.jos(true);
    }
    return true;
  };
  // Starea finală, fără mișcare: întrebările și răspunsurile, gata scrise.
  Telefon.prototype.static = function (lista) {
    this.gen++;
    this.deseneazaGol();
    var self = this;
    if (!lista.length) return;
    this.laDiscutie();
    lista.forEach(function (k, i) {
      var s = self.T.sc[k];
      var u = el('div', 'ri-pu'); u.textContent = (i === 0 && s.qSingur) ? s.qSingur : s.q; self.msgs.appendChild(u);
      var r = raspuns(s, true); self.msgs.appendChild(r.row);
      if (s.numara && self.o.contorDupa) self.puneContor(self.o.contorDupa);
      if (s.sursa && self.sursa) self.puneSursa(true, (self.sursa.ramase - 1) + ' din ' + self.sursa.total);
      if (s.gata) puneGata(null, r, s);
    });
    this.msgs.scrollTop = 0;
  };

  // ── Telefonul din primul ecran: patru întrebări în aceeași discuție, apoi de la capăt ──
  function erou(gazda) {
    var T = new Telefon(gazda, {});
    var tabs = Array.prototype.slice.call((gazda.parentNode || document).querySelectorAll('[data-ri-taburi] [data-sc]'));
    var marcheaza = function (k) { tabs.forEach(function (t) { t.setAttribute('aria-pressed', String(t.getAttribute('data-sc') === k)); }); };
    async function bucla(de) {
      var g = ++T.gen;
      var start = Math.max(0, ORDINE.indexOf(de || 'unde'));
      T.deseneazaGol();
      if (!de) { marcheaza(null); if (!(await T.pauza(g, 2600))) return; }
      else T.laDiscutie();
      for (;;) {
        for (var i = start; i < ORDINE.length; i++) {
          marcheaza(ORDINE[i]);
          if (!(await T.joacaUna(g, ORDINE[i], de && i === start))) return;
          if (!(await T.pauza(g, ORDINE[i] === 'dece' ? 5200 : 3600))) return;
        }
        start = 0; de = null;
        T.deseneazaGol(); marcheaza(null);
        if (!(await T.pauza(g, 3200))) return;
      }
    }
    tabs.forEach(function (t) {
      t.addEventListener('click', function () {
        var k = t.getAttribute('data-sc');
        if (MISCARE) bucla(k); else { marcheaza(k); T.static([k]); }
      });
    });
    if (MISCARE) bucla(); else { marcheaza('unde'); T.static(['unde']); }
    return T;
  }

  // ── Pachetele: comutatorul, cine întreabă, câte întrebări are; trece singur de la unul la altul ──
  // Pe prima pagină, UN telefon cu Start · Basic · Pro · Business, pe TOATE lățimile (19.11, Alin: „un singur telefon care să includă și
  // Start, cum e telefonul 2, cu toggle — am prea multe telefoane pe pagină”; pe 18.11 fusese doar sub 720 px): coloana Start de alături
  // se ascunde (`ri-col-start` în `ri-unul`, stilul în pagină), iar telefonul ăsta primește butonul „Start”, primul. Textele Start NU se
  // scriu aici: se iau din coloana Start a paginii (aceeași hârtie, legată de pachete.js prin probe). În aplicație („Vezi pachetele”) nu
  // e coloană Start: rămân Basic / Pro / Business.
  function platit(gazda) {
    gazda.innerHTML = '';
    var doi = gazda.closest ? gazda.closest('.tel-doi') : null;
    var tStart = doi ? doi.querySelector('[data-ri-demo="start"]') : null;
    var colStart = tStart && tStart.parentNode && tStart.parentNode !== gazda ? tStart.parentNode : null;
    var lista = colStart ? ['start'].concat(PLANURI) : PLANURI;
    if (colStart) { doi.classList.add('ri-unul'); colStart.classList.add('ri-col-start'); }
    var sel = el('div', 'ri-pk-sel'); sel.setAttribute('role', 'group'); sel.setAttribute('aria-label', 'Alege pachetul');
    if (colStart) { var bs = el('button', 'ri-pk-b ri-pk-start'); bs.type = 'button'; bs.textContent = 'Start'; bs.setAttribute('data-pk', 'start'); bs.setAttribute('aria-pressed', 'false'); sel.appendChild(bs); }
    PLANURI.forEach(function (k) { var b = el('button', 'ri-pk-b'); b.type = 'button'; b.textContent = PACHETE[k].nume; b.setAttribute('data-pk', k); b.setAttribute('aria-pressed', 'false'); sel.appendChild(b); });
    var info = el('div', 'ri-pk-info');
    var tel = el('div', 'ri-tel');
    var cine = el('div', 'ri-exemplu');
    gazda.appendChild(sel); gazda.appendChild(info); gazda.appendChild(tel); gazda.appendChild(cine);
    var T = new Telefon(tel, { sursa: { on: false, nr: '' } });
    var marcheaza = function (k) {
      sel.querySelectorAll('[data-pk]').forEach(function (b) { b.setAttribute('aria-pressed', String(b.getAttribute('data-pk') === k)); });
      info.innerHTML = '';
      if (k === 'start') {
        var si = colStart.querySelector('.ri-pk-info'), se = colStart.querySelector('.ri-exemplu');
        if (si) Array.prototype.slice.call(si.childNodes).forEach(function (n) { info.appendChild(n.cloneNode(true)); });
        cine.textContent = se ? se.textContent : '';
        T.o.start = true; T.sursa = null; T.cine = START.cine; T.contor = START.contor[0]; T.o.contorDupa = START.contor[1];
        return;
      }
      T.o.start = false;
      var p = PACHETE[k];
      info.appendChild(el('b', null)).textContent = p.titlu;
      info.appendChild(document.createTextNode(' ' + p.pentru));
      var c = el('div', 'ri-pk-cifre');
      c.textContent = 'Conturi: ' + p.conturi + ' · Întrebări libere, cu AI: ' + p.intrebari + ' · Sursă externă: ' + p.sursa + ' pe lună';
      info.appendChild(c);
      cine.textContent = 'În telefon: ' + p.cine + ', ' + p.rol + ' · Exemplu cu o flotă de probă';
      T.cine = p.cine; T.o.contorDupa = p.contor[1];
      T.contor = p.contor[0]; T.sursa = { on: false, nr: '', ramase: p.sursaRamase, total: p.sursa };
    };
    var scena = function (k) { return k === 'start' ? 'ieri' : PACHETE[k].sc; };
    async function bucla(de) {
      var i = Math.max(0, lista.indexOf(de || lista[0]));
      var g = ++T.gen;
      for (;;) {
        var k = lista[i];
        marcheaza(k); T.deseneazaGol();
        if (!(await T.pauza(g, 1800))) return;
        if (!(await T.joacaUna(g, scena(k)))) return;
        if (!(await T.pauza(g, 5600))) return;
        i = (i + 1) % lista.length;
      }
    }
    var arata = function (k) { if (MISCARE) bucla(k); else { marcheaza(k); T.static([scena(k)]); } };
    sel.addEventListener('click', function (e) {
      var b = e.target.closest ? e.target.closest('[data-pk]') : null; if (!b) return;
      arata(b.getAttribute('data-pk'));
    });
    arata(lista[0]);
    return T;
  }

  // ── O bucată de ecran (secțiunea RA Insight): întrebarea și răspunsul, gata scrise ──
  function bucata(gazda) {
    var k = gazda.getAttribute('data-sc'), s = texte(Date.now()).sc[k]; if (!s) return null;
    var inn = el('div', 'ri-ecran-in');
    var u = el('div', 'ri-pu'); u.textContent = s.qSingur || s.q; inn.appendChild(u);
    var r = raspuns(s, true); inn.appendChild(r.row);
    if (s.gata || s.dupa && /ri-rap/.test(s.dupa)) { var act = r.bub.querySelector('.ri-act'); if (act) act.parentNode.removeChild(act); }
    gazda.innerHTML = ''; gazda.appendChild(inn);
    return null;
  }

  // `data-ri-demo="start"` (coloana Start a primei pagini) nu se mai desenează singur din 19.11: e doar reperul după care `platit` își
  // găsește coloana Start, o ascunde și îi ia textele — pachetul Start se vede în telefonul cu comutator.
  var FELURI = { erou: erou, platit: platit, bucata: bucata };
  function porneste(radacina) {
    var r = radacina || document;
    var l = Array.prototype.slice.call(r.querySelectorAll ? r.querySelectorAll('[data-ri-demo]') : []);
    if (r.getAttribute && r.getAttribute('data-ri-demo')) l.unshift(r);
    l.forEach(function (e) {
      if (e._riPornit) return;
      var f = FELURI[e.getAttribute('data-ri-demo')]; if (!f) return;
      e._riPornit = true;
      try { e._riTel = f(e) || e._riTel; } catch (err) { if (window.console) console.error('RA Insight demo:', err); }
    });
  }
  // Fereastra închisă (aplicația): telefoanele dinăuntru se opresc.
  function opreste(radacina) {
    var r = radacina || document;
    Array.prototype.slice.call(r.querySelectorAll ? r.querySelectorAll('[data-ri-demo]') : []).concat(r._riTel ? [r] : []).forEach(function (e) {
      var t = e._riTel || (e.querySelector('.ri-tel') || {})._riTel;
      if (t && t.opreste) t.opreste();
    });
  }

  window.RaInsightDemo = { porneste: porneste, opreste: opreste, _texte: texte, _PACHETE: PACHETE, _PLANURI: PLANURI, _START: START, _ORDINE: ORDINE,
    _CHIPS: CHIPS, _CHIPS_START: CHIPS_START, _LOC: LOC, _LOC_START: LOC_START };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', function () { porneste(document); });
  else porneste(document);
})();
