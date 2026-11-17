/* Agenții AI — telefonul de prezentare de pe prima pagină (17.11; Alin, la cele trei machete: „hai să facem varianta B să o testez").
   În stânga cei șase agenți (butoanele, în pagină), în dreapta un telefon cu pagina agentului din aplicație („Agenți AI" → agentul).
   Trece singur de la unul la altul cât e pe ecran; un clic alege agentul; mouse-ul sau tastatura pe el îl opresc pe loc.

   Ce scrie în telefon e ce scrie aplicația:
     - constatările = ce scriu AGENȚII ADEVĂRAȚI (agents.js) pe flota de probă din agenti_demo_flota.js, la ora din telefon —
       verify_agenti_demo.js îi rulează și compară rând cu rând (titlul, textul, culoarea, ordinea, cartonașul lui RA Client);
     - numele, rolurile și descrierile = AGENTS din agents.js; iconițele = AGP_META, etichetele ecranului = pagina din aplicație
       (agpOpen, agpLiveRefresh, _agpClientCard din public/index.html) — legate de aceeași probă.
   Mașinile și cifrele sunt de probă; zilele se socotesc față de azi, pe ora României, ca pagina să nu îmbătrânească.
   Cine a cerut „mai puțină mișcare" vede agentul ales, fără schimbări singure. */
(function () {
  'use strict';
  if (window.AgentiDemo) return;
  var MISCARE = !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  var TZ = 'Europe/Bucharest', ZI = 864e5;
  // Ora din telefon = ora la care rulează agenții pe flota de probă (agenti_demo_flota.js → ORA_TELEFON): RA Dispatch caută
  // mașinile nefolosite abia după-amiaza. RA Watch a rulat ultima oară la ora fixă de dinainte („verifică din oră în oră").
  var ORA = '14:30', RULARE = '14:00', ACUM_RULARE = 'acum 30m';
  var ZILE_ITP = 12, ZILE_RCA = 19;
  var DUR = 8500;
  var _fd = null;
  // „29.11.2026" — ca roDate din agents.js (toLocaleDateString('ro-RO')), pe ora României.
  function zi(acum, n) {
    if (!_fd) _fd = new Intl.DateTimeFormat('ro-RO', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
    return _fd.format(new Date(acum + n * ZI));
  }

  // Etichetele paginii agentului din aplicație (public/index.html).
  var APP = {
    bara: 'Agenți AI', inapoi: 'Toți agenții', activ: 'activ', ruleaza: 'Rulează', cum: 'Cum funcționează', scan: 'Se verifică flota…',
    toateVazute: 'Toate văzute', ultimaRulare: 'Ultima rulare: ', automat: ' · verifică automat din oră în oră', verificat: 'Verificat: ',
    seActualizeaza: ' · se actualizează când deschizi pagina sau apeși „Rulează".',
    client: { km: 'Parcurși azi', active: 'Vehicule active', nefolosite: 'Nefolosite azi', ieri: 'Față de ieri', top: 'Cel mai activ: ',
      ydKm: 'Ieri, până la aceeași oră: ', deVerificat: 'DE VERIFICAT' }
  };

  // Cei șase, în ordinea butoanelor din pagină. `live` = agenții care se verifică la deschiderea paginii (LIVE_AGENT_KEYS din pagină).
  function date(acum) {
    return [
      { k: 'watch', nume: 'RA Watch', rol: 'Supraveghere', desc: 'Offline, furt combustibil, ralanti prelungit, tahograf neconfigurat.', ic: 'fa-shield-halved',
        live: false, fh: 'Verificări & alerte',
        f: [
          { s: 'critical', t: 'B 204 RAT: scădere combustibil ~42 L', b: 'Posibil furt sau scurgere (prag 15 L). Verifică traseul și opririle.' },
          { s: 'warning', t: 'B 77 TIR: offline de 3h 10m', b: 'Vehiculul nu mai trimite poziții de peste 60 min. Dacă ar trebui să fie pe drum, sună șoferul; dacă e în service sau parcat într-o hală sau sub pământ, e normal.' },
          { s: 'info', t: 'B 18 VAN: ralanti ~135 min azi', b: 'Motor pornit, staționat îndelung (peste 120 min). Combustibil irosit.' }
        ] },
      { k: 'care', nume: 'RA Care', rol: 'Mentenanță', desc: 'ITP, RCA, revizii și intervale de service — pe dată sau pe km.', ic: 'fa-wrench',
        live: true, fh: 'Scadențe acum',
        f: [
          { s: 'warning', t: 'B 31 LOG: ITP expiră în ' + ZILE_ITP + ' zile', b: 'ITP expiră la ' + zi(acum, ZILE_ITP) + '.' },
          { s: 'warning', t: 'B 90 CTR: RCA expiră în ' + ZILE_RCA + ' zile', b: 'RCA expiră la ' + zi(acum, ZILE_RCA) + '.' }
        ] },
      { k: 'optimize', nume: 'RA Optimize', rol: 'Eco-driving', desc: 'Scor eco, frânări/accelerări bruște, viteză, risipă la ralanti.', ic: 'fa-leaf',
        live: true, fh: 'Scor eco — azi',
        f: [
          { s: 'warning', t: 'B 204 RAT: scor eco 54/100', b: 'Scor eco 54/100 (prag: sub 60). Ce a tras scorul jos azi: 6 frânări bruște, 4 accelerări bruște. Sugestii pentru șofer: anticipează traficul și frânează lin, din timp — ține distanță față de mașina din față; demarează lin, fără apăsări bruște pe accelerație.' },
          { s: 'info', t: 'Flotă: 3h 10m ralanti azi', b: 'Risipă estimată ~4,8 L (~36 lei). Reducerea ralantiului scade direct costurile.' }
        ] },
      { k: 'compliance', nume: 'RA Compliance', rol: 'Ore de condus', desc: 'Condus continuu și zilnic (Reg. 561) — doar vehicule cu tahograf, nu turisme.', ic: 'fa-clipboard-check',
        live: true, fh: 'Ore de condus — azi',
        f: [
          { s: 'warning', t: 'B 90 CTR: conducere continuă ~4h 40m — limită depășită', b: 'Limita legală e 4h30 fără pauză de 45 min (Reg. CE 561/2006). Ce faci acum: oprește vehiculul pentru pauza obligatorie de 45 min. Estimare din GPS — pentru control oficial rămâne valabil tahograful.' }
        ] },
      { k: 'client', nume: 'RA Client', rol: 'Sinteza zilei', desc: 'Ziua într-un rând: km, active, comparație cu ieri + ce au găsit ceilalți agenți.', ic: 'fa-file-lines',
        live: true, fh: 'Sinteza zilei',
        sumar: { fleetSize: 8, active: 7, unused: 1, totalKm: 1240, ydKm: 1107, pct: 12, top: { name: 'B 90 CTR', km: 412 },
          issues: [
            { key: 'watch', agent: 'RA Watch', text: '3 alerte de monitorizare' },
            { key: 'care', agent: 'RA Care', text: '2 scadențe' },
            { key: 'optimize', agent: 'RA Optimize', text: '1 vehicul cu scor slab' },
            { key: 'compliance', agent: 'RA Compliance', text: '1 semnalare la orele de condus' }
          ] } },
      { k: 'dispatch', nume: 'RA Dispatch', rol: 'Dispecerat', desc: 'Vehicule disponibile acum și cele subutilizate în ziua curentă.', ic: 'fa-compass',
        live: true, fh: 'Disponibile acum',
        f: [
          { s: 'info', t: '3 vehicule disponibile acum pentru curse', b: 'Online și staționate: B 204 RAT, B 18 VAN, B 31 LOG.' },
          { s: 'info', t: 'B 31 LOG: nefolosit azi — disponibil', b: 'Sub 1 km parcurși azi și staționat acum. Candidat bun pentru o cursă nouă.' }
        ] }
    ];
  }
  // „1.240" — ca nrRo din agents.js.
  function nr(x) { return String(Math.round(Number(x) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function ic(nume) { var i = document.createElement('i'); i.className = 'fa-solid ' + nume; i.setAttribute('aria-hidden', 'true'); return i; }
  function cuIc(tag, cls, icon, text) { var e = el(tag, cls); e.appendChild(ic(icon)); e.appendChild(document.createTextNode(' ' + text)); return e; }
  function rand(f) {
    var r = el('div', 'agd-fi agd-' + (f.s === 'critical' ? 'c' : f.s === 'warning' ? 'w' : 'i'));
    r.appendChild(el('span', 'agd-fd'));
    var b = el('div', 'agd-fi-b'); b.appendChild(el('div', 'agd-ti', f.t)); if (f.b) b.appendChild(el('div', 'agd-bo', f.b)); if (f.tm) b.appendChild(el('div', 'agd-tm', f.tm));
    r.appendChild(b); return r;
  }
  function scan() {
    var r = el('div', 'agd-fi agd-scan'); r.appendChild(el('span', 'agd-fd'));
    var b = el('div', 'agd-fi-b'), t = el('div', 'agd-ti'); var i = ic('fa-spinner'); if (MISCARE) i.className += ' fa-spin';
    t.appendChild(i); t.appendChild(document.createTextNode(APP.scan)); b.appendChild(t); r.appendChild(b); return r;
  }
  // RA Client: cartonașul zilei, ca _agpClientCard din aplicație. Un clic pe „De verificat" deschide agentul (ca acolo).
  function cartonasClient(s, alege) {
    var w = el('div', 'agd-fi-cl');
    var tiles = el('div', 'agd-tiles');
    var tile = function (val, unit, lbl, cls) { var t = el('div', 'agd-tile' + (cls ? ' ' + cls : '')); var b = el('b', null, val); if (unit) { if (unit.charAt(0) !== '/') b.appendChild(document.createTextNode(' ')); b.appendChild(el('small', null, unit)); } t.appendChild(b); t.appendChild(el('span', null, lbl)); return t; };
    tiles.appendChild(tile(nr(s.totalKm), 'km', APP.client.km));
    tiles.appendChild(tile(String(s.active), '/' + s.fleetSize, APP.client.active));
    tiles.appendChild(tile(String(s.unused), '', APP.client.nefolosite, s.unused > 0 ? 'agd-or' : ''));
    tiles.appendChild(tile(s.pct == null ? '—' : (s.pct >= 0 ? '+' : '') + s.pct + '%', '', APP.client.ieri, s.pct == null ? '' : s.pct >= 0 ? 'agd-ok' : 'agd-or'));
    w.appendChild(tiles);
    var lin = el('div', 'agd-lin');
    if (s.top) { var l1 = el('div'); l1.appendChild(ic('fa-trophy')); l1.appendChild(document.createTextNode(' ' + APP.client.top)); l1.appendChild(el('b', null, s.top.name)); l1.appendChild(document.createTextNode(' — ' + nr(s.top.km) + ' km')); lin.appendChild(l1); }
    if (s.ydKm != null) { var l2 = el('div'); l2.appendChild(ic('fa-clock-rotate-left')); l2.appendChild(document.createTextNode(' ' + APP.client.ydKm)); l2.appendChild(el('b', null, nr(s.ydKm) + ' km')); lin.appendChild(l2); }
    w.appendChild(lin);
    if (s.issues && s.issues.length) {
      var dv = el('div', 'agd-dv'); dv.appendChild(el('div', null, APP.client.deVerificat));
      s.issues.forEach(function (x) {
        var b = el('button'); b.type = 'button'; b.appendChild(el('span', 'agd-fd'));
        var t = el('span', 'agd-dv-t'); t.appendChild(el('b', null, x.text)); t.appendChild(document.createTextNode(' ')); t.appendChild(el('em', null, '· ' + x.agent)); b.appendChild(t);
        b.appendChild(ic('fa-chevron-right'));
        b.addEventListener('click', function () { alege(x.key); });
        dv.appendChild(b);
      });
      w.appendChild(dv);
    }
    return w;
  }

  function porneste(rad) {
    if (!rad || rad._agd) return;
    var lista = rad.querySelector('.agd-lista'), loc = rad.querySelector('.agd-tel-loc');
    if (!lista || !loc) return;
    rad._agd = true;
    var ag = date(Date.now());
    var dupaK = {}; ag.forEach(function (a, i) { dupaK[a.k] = i; });
    var butoane = Array.prototype.slice.call(lista.querySelectorAll('.agd-b[data-k]')).filter(function (b) { return dupaK[b.getAttribute('data-k')] != null; });
    rad.style.setProperty('--agd-dur', DUR + 'ms');

    // Telefonul: aceeași ramă ca telefonul RA Insight de pe pagină.
    var tel = el('div', 'ri-tel agd-tel'); tel.setAttribute('role', 'img');
    var scr = el('div', 'ri-scr');
    scr.appendChild(el('div', 'ri-isl'));
    var st = el('div', 'ri-st'); st.appendChild(el('span', null, ORA)); var sti = el('span', 'ri-st-ic'); ['fa-signal', 'fa-wifi', 'fa-battery-three-quarters'].forEach(function (n) { sti.appendChild(ic(n)); }); st.appendChild(sti); scr.appendChild(st);
    var bar = el('div', 'ri-bar'); var b1 = el('span', 'ri-b'); b1.appendChild(ic('fa-bars')); bar.appendChild(b1); bar.appendChild(el('span', 'ri-bt', APP.bara)); var b2 = el('span', 'ri-b'); b2.appendChild(ic('fa-ellipsis')); bar.appendChild(b2); scr.appendChild(bar);
    var corp = el('div', 'agd-corp'); scr.appendChild(corp);
    var sub = el('div', 'agd-f'); scr.appendChild(sub);
    scr.appendChild(el('div', 'ri-home'));
    tel.appendChild(scr); loc.appendChild(tel);

    var cur = 0, gen = 0, ceas = null, pornit = false, pauza = false, vazut = !('IntersectionObserver' in window);
    function alegeK(k) { if (dupaK[k] == null) return; alege(dupaK[k], true); }
    // Desenează agentul i; `gata` = direct starea de la capăt (fără „Se verifică flota…").
    function deseneaza(i, gata) {
      var a = ag[i];
      butoane.forEach(function (b) {
        var e = b.getAttribute('data-k') === a.k; b.setAttribute('aria-pressed', String(e));
        var br = b.querySelector('.agd-bara'); if (br) { br.style.animation = 'none'; void br.offsetWidth; br.style.animation = ''; }
      });
      tel.setAttribute('aria-label', 'Telefon cu pagina agentului ' + a.nume + ' din aplicația RA Track (exemplu cu o flotă de probă)');
      corp.textContent = '';
      corp.appendChild(cuIc('div', 'agd-back', 'fa-arrow-left', APP.inapoi));
      var h = el('div', 'agd-head'); var t = el('div', 'agd-b-ic'); t.appendChild(ic(a.ic)); h.appendChild(t);
      var n = el('div'); n.appendChild(el('b', null, a.nume)); n.appendChild(el('small', null, a.rol)); h.appendChild(n); h.appendChild(el('span', 'agd-activ', APP.activ)); corp.appendChild(h);
      corp.appendChild(el('div', 'agd-desc', a.desc));
      var act = el('div', 'agd-act'); act.appendChild(cuIc('span', 'agd-p', 'fa-bolt', APP.ruleaza)); act.appendChild(cuIc('span', null, 'fa-circle-question', APP.cum)); corp.appendChild(act);
      var fh = el('div', 'agd-fh'); fh.appendChild(el('b', null, a.fh));
      if (!a.live && a.f.length > 1) fh.appendChild(cuIc('span', null, 'fa-check-double', APP.toateVazute + ' (' + a.f.length + ')'));
      corp.appendChild(fh);
      var feed = el('div', 'agd-feed'), sc = scan();
      var parti = a.sumar ? [cartonasClient(a.sumar, alegeK)] : a.f.map(function (f) { return rand(a.live ? f : { s: f.s, t: f.t, b: f.b, tm: ACUM_RULARE }); });
      if (!gata) { feed.appendChild(sc); parti.forEach(function (p) { p.classList.add('agd-ascuns'); }); }
      parti.forEach(function (p) { feed.appendChild(p); }); corp.appendChild(feed);
      sub.textContent = ''; sub.appendChild(ic('fa-clock'));
      var s = el('span');
      if (a.live) { s.appendChild(document.createTextNode(APP.verificat)); s.appendChild(el('b', null, zi(Date.now(), 0) + ', ' + ORA)); s.appendChild(document.createTextNode(APP.seActualizeaza)); }
      else { s.appendChild(document.createTextNode(APP.ultimaRulare)); s.appendChild(el('b', null, 'azi ' + RULARE)); s.appendChild(document.createTextNode(APP.automat)); }
      sub.appendChild(s);
      return { sc: sc, parti: parti };
    }
    function opresteCeas() { if (ceas) { clearTimeout(ceas); ceas = null; } }
    function asteapta(g, ms) { return new Promise(function (r) { ceas = setTimeout(function () { ceas = null; r(g === gen); }, ms); }); }
    // Un agent: apare „Se verifică flota…", apoi constatările una câte una; după DUR trece la următorul (dacă nu e oprit).
    async function arata(i) {
      var g = ++gen; opresteCeas();
      corp.classList.add('agd-stins'); if (!(await asteapta(g, 220))) return;
      var d = deseneaza(i, false); corp.classList.remove('agd-stins');
      if (!(await asteapta(g, 1150))) return;
      d.sc.remove();
      for (var j = 0; j < d.parti.length; j++) { d.parti[j].classList.remove('agd-ascuns'); if (!(await asteapta(g, 600))) return; }
      var rest = DUR - 1370 - d.parti.length * 600;
      if (!(await asteapta(g, rest))) return;
      while (pauza || !vazut) { if (!(await asteapta(g, 400))) return; }
      cur = (cur + 1) % ag.length; arata(cur);
    }
    function alege(i, dinClic) {
      cur = i;
      if (!MISCARE) { gen++; opresteCeas(); deseneaza(i, true); return; }
      if (dinClic || pornit) arata(i);
    }
    butoane.forEach(function (b) {
      var k = b.getAttribute('data-k');
      b.setAttribute('aria-pressed', 'false');
      if (!b.querySelector('.agd-bara')) b.appendChild(el('i', 'agd-bara'));
      b.addEventListener('click', function () { alege(dupaK[k], true); });
    });
    deseneaza(0, true);
    if (!MISCARE) return;
    var seta = function (p) { pauza = p; rad.classList.toggle('agd-pauza', p); };
    rad.addEventListener('mouseenter', function () { seta(true); });
    rad.addEventListener('mouseleave', function () { seta(rad.contains(document.activeElement)); });
    rad.addEventListener('focusin', function () { seta(true); });
    rad.addEventListener('focusout', function (e) { if (!rad.contains(e.relatedTarget)) seta(rad.matches(':hover')); });
    var porn = function () { if (!pornit) { pornit = true; arata(cur); } };
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (l) { l.forEach(function (x) { vazut = x.isIntersecting; if (vazut) porn(); }); }, { threshold: 0.25 }).observe(rad);
    } else porn();
  }

  function pornesteToate() { Array.prototype.slice.call(document.querySelectorAll('[data-agenti-demo]')).forEach(porneste); }
  window.AgentiDemo = { porneste: porneste, _date: date, _APP: APP, ORA: ORA, RULARE: RULARE, ACUM_RULARE: ACUM_RULARE, ZILE_ITP: ZILE_ITP, ZILE_RCA: ZILE_RCA, DUR: DUR };
  if (typeof document === 'undefined') return;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', pornesteToate); else pornesteToate();
})();
