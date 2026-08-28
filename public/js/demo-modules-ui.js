/* demo-modules-ui.js — UI pentru cele 3 module demo-ready (e-Transport, E-Toll/Roviniete, Tahograf).
 * Self-contained: injectează containerele de view, definește openerele globale, apelează backend-ul.
 * Integrat cu showView via VIEW_PANELS/VIEW_OPENERS (vezi index.html). Stack: vanilla JS + Chart.js. */
(function () {
  'use strict';
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(id) { return document.getElementById(id); }
  function api(path, opts) { return fetch(path, Object.assign({ credentials: 'same-origin' }, opts || {})).then(function (r) { return r.json().catch(function () { return {}; }); }); }
  function apiRaw(path, opts) { return fetch(path, Object.assign({ credentials: 'same-origin' }, opts || {})); }
  function postJSON(path, body) { return api(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) }); }
  function modeBadge(mode) { var real = mode === 'real'; return '<span class="dm-badge ' + (real ? 'dm-real' : 'dm-demo') + '">' + (real ? '● REAL' : '● DEMO') + '</span>'; }
  function toast(msg, type) { if (window.raxToast) window.raxToast(msg, type); else console.log(msg); }

  // ── Containere view (injectate o singură dată) ──
  function ensureContainers() {
    [['etransport-view', 'fa-truck-fast', 'e-Transport (ANAF)'],
     ['etoll-view', 'fa-road', 'Taxa de drum (TollRo)'],
     ['tahograf-view', 'fa-id-card', 'Tahograf']].forEach(function (v) {
      if (el(v[0])) return;
      var d = document.createElement('div');
      d.id = v[0]; d.className = 'modal-overlay';
      d.innerHTML = '<div class="modal dm-modal"><h2><span><i class="fas ' + v[1] + '" style="margin-right:8px;color:var(--accent)"></i>' + v[2] + ' <span id="' + v[0] + '-mode"></span></span>' +
        '<button class="close-btn" onclick="showView(\'localizare\')" style="position:static;font-size:18px;">&#10005;</button></h2>' +
        '<div id="' + v[0] + '-body" class="dm-body"><div class="dm-muted">Se încarcă…</div></div></div>';
      document.body.appendChild(d);
    });
  }

  function vehicleOptions() {
    var out = '<option value="">— alege vehicul —</option>';
    try { if ((window.getDevicesMap && window.getDevicesMap())) (window.getDevicesMap && window.getDevicesMap()).forEach(function (d, imei) { out += '<option value="' + esc(imei) + '" data-plate="' + esc(d.plate || '') + '">' + esc(d.name || imei) + (d.plate ? ' · ' + esc(d.plate) : '') + '</option>'; }); } catch (e) {}
    return out;
  }

  /* ═══════════════ MODUL 1: e-Transport ═══════════════ */
  var _txPoll = null, _txCurrentId = null;
  window.openEtransportDemo = async function () {
    ensureContainers();
    var cfg = await api('/api/demo-modules/config').catch(function () { return {}; });
    var mode = (cfg.etransport && cfg.etransport.mode) || 'demo';
    el('etransport-view-mode').innerHTML = modeBadge(mode);
    var list = await api('/api/etransport').catch(function () { return []; });
    if (!Array.isArray(list)) list = [];
    el('etransport-view-body').innerHTML =
      '<div class="dm-grid2">' +
        '<div class="dm-card"><h3>Date transport</h3>' +
          '<label class="dm-lbl">Vehicul</label><select id="et-veh" class="dm-input">' + vehicleOptions() + '</select>' +
          '<label class="dm-lbl">Marfă</label><input id="et-marfa" class="dm-input" placeholder="ex: Cereale, 22t">' +
          '<div class="dm-row"><div style="flex:1"><label class="dm-lbl">Adresă plecare</label><input id="et-from" class="dm-input" placeholder="Loc încărcare"></div>' +
          '<div style="flex:1"><label class="dm-lbl">Adresă sosire</label><input id="et-to" class="dm-input" placeholder="Loc descărcare"></div></div>' +
          '<div class="dm-uit-box"><button class="dm-btn primary" id="et-uit-btn" onclick="etGetUIT()"><i class="fas fa-barcode"></i> Obține Cod UIT</button>' +
          '<span id="et-uit-out" class="dm-uit-out"></span></div>' +
          '<div id="et-actions" style="display:none;margin-top:10px;"><button class="dm-btn ok" id="et-start" onclick="etStart()"><i class="fas fa-play"></i> Start Transport</button> ' +
          '<button class="dm-btn danger" id="et-stop" onclick="etStop()" style="display:none;"><i class="fas fa-stop"></i> Stop</button></div>' +
        '</div>' +
        '<div class="dm-card"><h3>Flux GPS → ANAF <span class="dm-muted" style="font-size:11px">(coadă de trimitere)</span></h3>' +
          '<div id="et-sim" class="dm-sim"><div class="dm-muted">Pornește un transport ca să vezi fluxul de coordonate trimis din minut în minut.</div></div>' +
        '</div>' +
      '</div>' +
      '<div class="dm-card" style="margin-top:14px;"><h3>Transporturi</h3>' + etListHtml(list) + '</div>';
  };
  function etListHtml(list) {
    if (!list.length) return '<div class="dm-muted">Niciun transport încă.</div>';
    return '<table class="dm-table"><thead><tr><th>UIT</th><th>Vehicul</th><th>Status</th><th>Start</th></tr></thead><tbody>' +
      list.map(function (t) { return '<tr><td style="font-family:monospace">' + esc(t.uit) + '</td><td>' + esc(t.plate || t.imei || '-') + '</td><td><span class="dm-pill ' + (t.status === 'activ' ? 'ok' : '') + '">' + esc(t.status || '-') + '</span></td><td>' + (t.start_at ? new Date(t.start_at).toLocaleString('ro-RO') : '-') + '</td></tr>'; }).join('') + '</tbody></table>';
  }
  window.etGetUIT = async function () {
    var btn = el('et-uit-btn'), out = el('et-uit-out');
    btn.disabled = true; out.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Se obține codul UIT…';
    await new Promise(function (r) { setTimeout(r, 1400); }); // simulează încărcarea ANAF
    var r = await postJSON('/api/etransport/uit', {});
    btn.disabled = false;
    if (r.error) { out.innerHTML = '<span style="color:var(--red)">' + esc(r.error) + '</span>'; return; }
    // creează înregistrarea
    var veh = el('et-veh'), imei = veh.value, plate = veh.options[veh.selectedIndex] ? veh.options[veh.selectedIndex].getAttribute('data-plate') : '';
    var note = JSON.stringify({ marfa: el('et-marfa').value, from: el('et-from').value, to: el('et-to').value });
    var tr = await postJSON('/api/etransport', { uit: r.uit, imei: imei, plate: plate, status: 'nou_uit', note: note });
    _txCurrentId = tr.id;
    out.innerHTML = '<span class="dm-uit-code">' + esc(r.uit) + '</span> ' + modeBadge(r.mode);
    el('et-actions').style.display = 'block';
    openEtransportDemo(); // refresh listă (păstrează starea curentă)
  };
  window.etStart = async function () {
    if (!_txCurrentId) return toast('Obține întâi un cod UIT', 'error');
    await postJSON('/api/etransport/' + _txCurrentId + '/start', {});
    el('et-start').style.display = 'none'; el('et-stop').style.display = 'inline-flex';
    if (_txPoll) clearInterval(_txPoll);
    _txPoll = setInterval(etPollSim, 2000); etPollSim();
  };
  window.etStop = async function () {
    if (_txPoll) { clearInterval(_txPoll); _txPoll = null; }
    if (_txCurrentId) await postJSON('/api/etransport/' + _txCurrentId + '/stop', {});
    el('et-start').style.display = 'inline-flex'; el('et-stop').style.display = 'none';
    toast('Transport finalizat', 'success');
  };
  async function etPollSim() {
    if (!_txCurrentId) return;
    var s = await api('/api/etransport/' + _txCurrentId + '/sim').catch(function () { return {}; });
    var box = el('et-sim'); if (!box) return;
    if (!s.running) { box.innerHTML = '<div class="dm-muted">Inactiv.</div>'; return; }
    var rows = (s.buffer || []).slice(-8).reverse().map(function (p) { return '<div class="dm-sim-row"><i class="fas fa-circle-check" style="color:var(--accent)"></i> ' + p.lat.toFixed(5) + ', ' + p.lng.toFixed(5) + ' <span class="dm-muted">' + new Date(p.ts).toLocaleTimeString('ro-RO') + ' · trimis ✓</span></div>'; }).join('');
    box.innerHTML = '<div class="dm-sim-head"><b>' + s.points + '</b> coordonate trimise · <span class="dm-muted">' + s.elapsedSec + 's</span> <span class="dm-live">● LIVE</span></div>' + rows;
  }

  /* ═══════════════ MODUL 2: TollRo — taxa rutieră pe kilometru ═══════════════ */
  // Deosebirea față de calculatoarele publice (unde tastezi numărul și VIN-ul oricărui camion):
  // aici vehiculul se ALEGE DIN FLOTĂ, iar profilul de taxare vine din fișa lui. Nu poți calcula
  // pentru o mașină care nu e a ta, și nu mai tastezi de fiecare dată masa, axele și norma Euro.
  var _tr = { cfg: null, imei: '', profil: null, rezultat: null, manual: {},
              flota: null, costuri: {}, lucreaza: false, opreste: false,
              // ── fila „Cursă" ──
              fila: 'cursa', rutare: null, cImei: '', cProfil: null, cStart: null, cEnd: null,
              cRez: null, cHarta: null, cLinii: [] };

  window.openEtollDemo = async function () {
    ensureContainers();
    _tr.cfg = await api('/api/tollro/config').catch(function () { return null; });
    _tr.flota = await api('/api/tollro/flota').catch(function () { return null; });
    _tr.rutare = await api('/api/tollro/rutare').catch(function () { return { pornit: false }; });
    // Fara eticheta „DEMO": calculul e REAL — tarifele sunt cele publicate, vehiculul e din flota,
    // kilometrii vin din traseul lui. Provizorii sunt doar cateva valori din grila, iar alea sunt
    // marcate acolo unde sunt. O eticheta „DEMO" peste tot i-ar face pe oameni sa nu creada nici
    // cifrele adevarate.
    var _d = _tr.cfg && _tr.cfg.grila ? _tr.cfg.grila.aplicabilDin : null;
    el('etoll-view-mode').innerHTML = _d
      ? '<span class="dm-badge dm-real" title="Data de la care se aplica taxa">din ' + esc(trData(_d)) + '</span>' : '';
    trRender();
  };

  function trData(iso) { var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '')); return m ? (m[3] + '.' + m[2] + '.' + m[1]) : String(iso || ''); }
  function trNum(v) { return Number(v || 0).toLocaleString('ro-RO', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }
  function trKm(v) { return Number(v || 0).toLocaleString('ro-RO', { maximumFractionDigits: 1 }); }

  // ── Ecranul: TOATĂ flota deodată, ordonată după cât costă ─────────────────────────────────────
  // Înainte se calcula o mașină pe rând, iar „care camion mă costă cel mai mult" nu se putea afla
  // decât făcând socoteala pe hârtie. Acum lista pleacă de la flotă.
  //
  // Costurile NU vin într-un singur răspuns: clasificarea drumurilor se ia de la OpenStreetMap, care
  // acceptă o cerere pe secundă. Pe zece camioane, un răspuns unic ar dura minute și ar cădea în
  // timeout. Cerem pe rând și umplem lista pe măsură ce vin — se vede că se lucrează.
  // Două întrebări diferite, două file. „Cursă" = cât mă costă drumul pe care îl PREGĂTESC (întrebarea
  // dispecerului care dă un preț). „Flota" = cât m-a costat ce am făcut deja. Prima e cea de zi cu zi,
  // deci e implicită.
  window.trFila = function (f) { _tr.fila = f; trRender(); };

  function trRender() {
    if (_tr.fila === 'cursa') return trRenderCursa();
    return trRenderFlota();
  }

  function trFileHtml() {
    return '<div class="tz-file">' +
      ['cursa,fa-route,O cursă nouă', 'flota,fa-truck,Toată flota'].map(function (x) {
        var p = x.split(',');
        return '<button class="tz-fila' + (_tr.fila === p[0] ? ' on' : '') + '" onclick="trFila(\'' + p[0] + '\')">' +
          '<i class="fas ' + p[1] + '"></i> ' + p[2] + '</button>';
      }).join('') + '</div>';
  }

  function trRenderFlota() {
    var azi = new Date().toISOString().slice(0, 10);
    var acum7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    var g = _tr.cfg && _tr.cfg.grila;
    var f = _tr.flota;
    // Dacă nicio mașină nu intră la taxă, butonul n-are ce calcula. Îl lăsăm stins și spunem de ce —
    // altfel omul îl apasă, primește un mesaj de eroare și crede că aplicația e stricată.
    var nimicDeCalculat = !!(f && f.sumar && f.sumar.taxabile === 0);
    el('etoll-view-body').innerHTML =
      trFileHtml() +
      '<div class="dm-card">' +
        '<div class="dm-row" style="align-items:flex-end;flex-wrap:wrap;gap:10px">' +
          '<label class="dm-lbl">De la<input type="date" id="tr-de-la" class="dm-input" value="' + acum7 + '" max="' + azi + '"' + (nimicDeCalculat ? ' disabled' : '') + '></label>' +
          '<label class="dm-lbl">Până la<input type="date" id="tr-pana-la" class="dm-input" value="' + azi + '" max="' + azi + '"' + (nimicDeCalculat ? ' disabled' : '') + '></label>' +
          '<button class="rax-btn primary" id="tr-btn-flota" onclick="trCalculeazaFlota()"' + (nimicDeCalculat ? ' disabled' : '') + '><i class="fas fa-calculator"></i> Calculează toată flota</button>' +
        '</div>' +
        '<div class="dm-muted" style="font-size:11.5px;margin-top:6px">' +
          (nimicDeCalculat
            ? 'Nu e nimic de calculat: niciun vehicul din flotă nu intră la taxa pe kilometru.'
            : 'Luăm traseul real al fiecărei mașini și, pentru fiecare bucată de drum, aflăm din OpenStreetMap ce fel de drum e. Maxim 8 zile odată.') +
        '</div>' +
      '</div>' +

      '<div class="dm-card" id="tr-flota">' + trFlotaHtml() + '</div>' +
      '<div id="tr-detaliu"></div>' +

      (g ? '<div class="dm-card"><h3>Grila de tarife' + (_tr.cfg.editabil ? '' : ' (doar informativ)') + '</h3>' +
        '<div class="dm-muted" style="font-size:11.5px;margin-bottom:8px">Se aplică din <b>' + esc(trData(g.aplicabilDin)) + '</b>. ' +
        'Valorile se stabilesc prin ordonanță și s-au tot amânat — de aceea stau aici, editabile, nu îngropate în cod.</div>' +
        trGrilaHtml(g, _tr.cfg.editabil) + '</div>' : '');
  }

  // Suma de sus se adună DOAR din vehiculele calculate. Cât timp mai sunt în lucru, scrie „până acum",
  // nu „total" — altfel omul citește un total care încă se mișcă și îl pune într-o ofertă.
  // ── începe lista flotei (REPER pentru probe: verify_tollro_flota.js decupează exact bucata
  // dintre reperul ăsta și cel de la sfârșit. Nu insera funcții noi între ele — s-a întâmplat
  // o dată, iar proba a picat cu „window is not defined", ceea ce e mai bine decât să treacă.) ──
  function trFlotaHtml() {
    var f = _tr.flota;
    if (!f) return '<h3>Flota</h3><div class="tr-nota rosu"><i class="fas fa-circle-exclamation"></i> Nu s-a putut citi lista vehiculelor.</div>';
    var v = f.vehicule || [];
    if (!v.length) return '<h3>Flota</h3><div class="dm-muted">Niciun vehicul în flotă.</div>';

    var taxabile = v.filter(function (x) { return x.aplicabil; });
    var restul = v.filter(function (x) { return !x.aplicabil; });
    var gata = taxabile.filter(function (x) { var c = _tr.costuri[x.imei]; return c && c.stare === 'gata'; });
    var total = gata.reduce(function (a, x) { return a + (_tr.costuri[x.imei].total || 0); }, 0);
    var kmTaxati = gata.reduce(function (a, x) { return a + (_tr.costuri[x.imei].kmTaxati || 0); }, 0);
    var inLucru = taxabile.length - gata.length;

    // Ordinea: cele calculate, descrescător după cost; apoi cele care încă așteaptă, în ordinea flotei.
    var calc = gata.slice().sort(function (a, b) { return _tr.costuri[b.imei].total - _tr.costuri[a.imei].total; });
    var restante = taxabile.filter(function (x) { var c = _tr.costuri[x.imei]; return !c || c.stare !== 'gata'; });

    var h = '<h3>Flota <span class="dm-muted" style="font-weight:400;font-size:12px">· ' +
      f.sumar.taxabile + ' cu taxă pe km, ' + f.sumar.neaplicabile + ' fără</span></h3>';

    // Niciun vehicul taxabil = ecranul n-are ce calcula NICIODATĂ pentru flota asta. Fără mesajul
    // ăsta rămâne o listă gri fără cap și fără coadă, iar omul se întreabă ce a stricat. E cazul
    // real al fondatorilor: trei autoturisme, zero camioane.
    if (!taxabile.length) {
      h += '<div class="tr-empty">' +
        '<i class="fas fa-road"></i>' +
        '<b>Nicio mașină din flotă nu intră la taxa pe kilometru</b>' +
        '<span>Taxa se plătește doar pentru transportul de marfă peste 3,5 t — camioane, autotractoare, autobuze. ' +
        'Autoturismele și vehiculele ușoare plătesc rovinietă, ca până acum.</span>' +
        '</div>';
    } else {
      if (gata.length) {
        h += '<div class="tr-tot">' +
          '<div class="tr-tot-s">' + trNum(total) + '<span>lei</span></div>' +
          '<div class="tr-tot-b">' + (inLucru ? 'până acum · ' + gata.length + ' din ' + taxabile.length + ' vehicule' : gata.length + ' vehicule') +
          ' · ' + trKm(kmTaxati) + ' km pe drum cu taxă</div></div>';
      }
      // Avertismentul despre data intrării în vigoare are sens doar dacă există sume de citit.
      // Pe o flotă fără camioane n-ar avertiza despre nimic.
      if (!f.inVigoare) {
        h += '<div class="tr-nota galben"><i class="fas fa-triangle-exclamation"></i> Taxa se aplică din <b>' + esc(trData(f.aplicabilDin)) +
          '</b>. Până atunci plătești rovinietă, iar sumele de aici sunt o previziune.</div>';
      }
      h += calc.map(trRandFlota).join('') + restante.map(trRandFlota).join('');
    }

    if (restul.length) {
      h += '<div class="tr-gh">' + (taxabile.length ? 'Fără taxă pe kilometru' : 'Vehiculele tale') + '</div>' +
        restul.map(trRandFlota).join('');
    }
    return h;
  }

  function trRandFlota(v) {
    var c = _tr.costuri[v.imei];
    var sub = [v.model, v.categorieEticheta, v.euroCunoscut ? v.euroEticheta : null].filter(Boolean).join(' · ');
    var dr = '';
    // Motivul e o FRAZĂ, nu o etichetă. Stătea în coloana din dreapta, scris mic și cu majuscule,
    // adică exact unde nu se poate citi un text lung — iar la o flotă fără camioane e singura
    // informație de pe ecran. Acum stă sub numele mașinii, în rând normal.
    if (!v.aplicabil) {
      dr = '<b class="pal">—</b>';
    } else if (!c || c.stare === 'asteapta') {
      dr = '<b class="pal">—</b><span>neCalculat</span>';
    } else if (c.stare === 'lucreaza') {
      dr = '<b class="pal"><i class="fas fa-spinner fa-spin"></i></b><span>se calculează</span>';
    } else if (c.stare === 'eroare') {
      dr = '<b class="pal">—</b><span class="rosu">' + esc(c.err || 'eroare') + '</span>';
    } else {
      dr = '<b>' + trNum(c.total) + '</b><span>lei</span>';
    }
    // Bara arată din CE se compune costul (autostradă vs național), nu cât e față de altă mașină.
    var bara = '';
    if (c && c.stare === 'gata' && c.total > 0) {
      bara = '<div class="tr-bara">' + (c.linii || []).filter(function (l) { return l.taxabil && l.cost > 0; }).map(function (l) {
        return '<i style="width:' + Math.round(l.cost / c.total * 100) + '%;background:' + l.culoare + '"></i>';
      }).join('') + '</div>';
    }
    return '<div class="tr-rand' + (v.aplicabil ? '' : ' gri') + (c && c.stare === 'gata' ? ' clic' : '') + '"' +
      (v.aplicabil ? ' onclick="trDeschideVehicul(\'' + esc(v.imei) + '\')"' : '') + '>' +
      '<div class="tr-r-l"><b>' + esc(v.numar || v.nume || v.imei) + '</b>' +
        (sub ? '<span>' + esc(sub) + '</span>' : '') +
        (!v.aplicabil && v.motiv ? '<span class="tr-motiv">' + esc(v.motiv) + '</span>' : '') +
        bara + '</div>' +
      '<div class="tr-r-r">' + dr + '</div></div>';
  }
  // ── sfârșit lista flotei ──

  // Calculul flotei: SECVENȚIAL, nu toate odată. Overpass acceptă o cerere pe secundă, iar zece
  // cereri paralele ar fi refuzate — am primi zece erori în loc de zece rezultate.
  window.trCalculeazaFlota = async function () {
    if (_tr.lucreaza) { _tr.opreste = true; return; }
    var f = _tr.flota; if (!f) return;
    var from = el('tr-de-la').value, to = el('tr-pana-la').value;
    if (!from || !to) { toast('Alege intervalul', 'error'); return; }

    var taxabile = (f.vehicule || []).filter(function (x) { return x.aplicabil; });
    if (!taxabile.length) { toast('Niciun vehicul cu taxă pe kilometru în flotă', 'error'); return; }

    _tr.lucreaza = true; _tr.opreste = false; _tr.costuri = {};
    taxabile.forEach(function (x) { _tr.costuri[x.imei] = { stare: 'asteapta' }; });
    var btn = el('tr-btn-flota');
    if (btn) btn.innerHTML = '<i class="fas fa-stop"></i> Oprește';
    el('tr-flota').innerHTML = trFlotaHtml();

    for (var i = 0; i < taxabile.length; i++) {
      if (_tr.opreste) break;
      var v = taxabile[i];
      _tr.costuri[v.imei] = { stare: 'lucreaza' };
      el('tr-flota').innerHTML = trFlotaHtml();
      var r = await postJSON('/api/tollro/din-istoric', { imei: v.imei, from: from + 'T00:00:00', to: to + 'T23:59:59' })
        .catch(function (e) { return { error: (e && e.message) || 'eroare de rețea' }; });
      if (r && r.rezultat && r.rezultat.aplicabil) {
        var z = r.rezultat;
        _tr.costuri[v.imei] = {
          stare: 'gata', total: z.total, linii: z.linii, avertismente: z.avertismente,
          kmTaxati: z.linii.reduce(function (a, l) { return a + (l.taxabil ? l.km : 0); }, 0),
          brut: r,
        };
      } else {
        // „Nu s-a mișcat" nu e o eroare — e un cost de zero, și trebuie să se vadă ca atare.
        var msg = (r && r.error) || (r && r.rezultat && r.rezultat.motiv) || 'nu s-a putut calcula';
        if (/nu există traseu|aproape nu s-a deplasat/i.test(msg)) {
          _tr.costuri[v.imei] = { stare: 'gata', total: 0, linii: [], kmTaxati: 0, nuSaMiscat: true };
        } else {
          _tr.costuri[v.imei] = { stare: 'eroare', err: msg };
        }
      }
      el('tr-flota').innerHTML = trFlotaHtml();
    }
    _tr.lucreaza = false;
    if (btn) btn.innerHTML = '<i class="fas fa-calculator"></i> Calculează toată flota';
    el('tr-flota').innerHTML = trFlotaHtml();
  };

  // Detaliul unei mașini: fișa ei + defalcarea costului, sub listă.
  window.trDeschideVehicul = function (imei) {
    _tr.imei = imei; _tr.manual = {};
    var box = el('tr-detaliu');
    box.innerHTML = '<div class="dm-card"><h3>Detalii vehicul</h3><div id="tr-profil"></div>' +
      '<div id="tr-rezultat" style="margin-top:12px"></div>' +
      '<details style="margin-top:12px"><summary class="dm-muted" style="cursor:pointer;font-size:12px">Vreau să introduc eu kilometrii</summary>' +
        '<div class="dm-row" style="align-items:flex-end;flex-wrap:wrap;gap:10px;margin-top:10px">' +
          '<label class="dm-lbl">Autostradă / expres (km)<input type="number" id="tr-km-a" class="dm-input" min="0" step="0.1" placeholder="0"></label>' +
          '<label class="dm-lbl">Drum național (km)<input type="number" id="tr-km-n" class="dm-input" min="0" step="0.1" placeholder="0"></label>' +
          '<label class="dm-lbl">Alte drumuri (km)<input type="number" id="tr-km-x" class="dm-input" min="0" step="0.1" placeholder="0"></label>' +
          '<button class="rax-btn primary" onclick="trManual()"><i class="fas fa-calculator"></i> Calculează</button>' +
        '</div></details></div>';
    trAlegeVehicul();
    var c = _tr.costuri[imei];
    if (c && c.stare === 'gata' && c.brut) trAfiseaza(c.brut, c.brut.atribuire);
    else if (c && c.nuSaMiscat) el('tr-rezultat').innerHTML = '<div class="dm-muted">Vehiculul nu s-a deplasat în intervalul ales — zero kilometri taxabili.</div>';
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  };

  // ═══ Fila „O cursă nouă" ═══════════════════════════════════════════════════════════════════════
  // Regula ecranului: OMUL alege trei lucruri — mașina, de unde, până unde. Restul (serie de șasiu,
  // masă, axe, normă, treaptă) se completează SINGUR din fișa vehiculului și nu se poate atinge.
  //
  // De ce nu se poate atinge: pe ecranul concurenței, categoria era un selector liber. Alin a lăsat
  // „3,5–7,5 t" pe un camion de 41 t declarat în ACELAȘI formular, iar costul a ieșit de trei ori mai
  // mic. Un câmp care poate contrazice alt câmp e o capcană, oricât ar părea de „flexibil".
  function trRenderCursa() {
    var r = _tr.rutare || {};
    el('etoll-view-body').innerHTML =
      trFileHtml() +
      (!r.pornit
        ? '<div class="tr-nota galben"><i class="fas fa-triangle-exclamation"></i> ' + esc(r.motiv || 'Calculul unui traseu nou nu e pornit.') +
          ' Poți alege vehiculul și adresele, dar costul nu se poate calcula până nu e configurat.</div>'
        : (r.deProba ? '<div class="tr-nota galben"><i class="fas fa-flask"></i> Traseele vin de pe un server public de probă. Bun pentru încercări, nu pentru o ofertă.</div>' : '')) +

      '<div class="dm-card"><h3>Profil vehicul</h3>' +
        '<div class="tz-cauta">' +
          '<i class="fas fa-magnifying-glass"></i>' +
          '<input id="tr-c-cauta" class="tz-cauta-i" placeholder="Caută după număr sau nume…" oninput="trCautaVehicul()" autocomplete="off">' +
        '</div>' +
        '<div id="tr-c-lista" class="tz-lista"></div>' +
        '<div id="tr-c-profil"></div>' +
      '</div>' +

      '<div class="dm-card"><h3>Traseu</h3>' +
        trAdresaHtml('start', 'Plecare', 'Scrie o localitate sau o adresă…') +
        trAdresaHtml('end', 'Destinație', 'Scrie o localitate sau o adresă…') +
        '<button class="tz-go mare" id="tr-c-btn" onclick="trCalcCursa()"' + (r.pornit ? '' : ' disabled') + '>' +
          '<i class="fas fa-bolt"></i> Calculează ruta și costurile</button>' +
        '<div id="tr-c-msg" class="tr-c-msg"></div>' +
      '</div>' +

      '<div id="tr-c-rez"></div>';
    trListaVehicule();
    trProfilCursa();
  }

  function trAdresaHtml(k, et, ph) {
    var ales = k === 'start' ? _tr.cStart : _tr.cEnd;
    return '<div class="tz-adr">' +
      '<label class="dm-lbl">' + et + '</label>' +
      '<div class="tz-cauta">' +
        '<i class="fas fa-' + (k === 'start' ? 'location-dot' : 'flag-checkered') + '"></i>' +
        '<input id="tr-a-' + k + '" class="tz-cauta-i" placeholder="' + esc(ph) + '" autocomplete="off"' +
          ' value="' + esc(ales ? ales.label : '') + '" oninput="trCautaAdresa(\'' + k + '\')">' +
        (ales ? '<button class="tz-x" onclick="trStergeAdresa(\'' + k + '\')" title="Șterge"><i class="fas fa-xmark"></i></button>' : '') +
      '</div>' +
      '<div id="tr-s-' + k + '" class="tz-sug"></div>' +
    '</div>';
  }

  // Lista de mașini, filtrată de caseta de căutare. La o flotă de trei mașini e de prisos; la
  // patruzeci, fără ea nu găsești nimic — de-aia caseta stă DEASUPRA listei, nu în locul ei.
  window.trCautaVehicul = function () { trListaVehicule(); };
  function trListaVehicule() {
    var box = el('tr-c-lista'); if (!box) return;
    var q = ((el('tr-c-cauta') || {}).value || '').trim().toLowerCase();
    var toate = (_tr.flota && _tr.flota.vehicule) || [];
    var l = toate.filter(function (v) {
      if (!q) return true;
      return ((v.numar || '') + ' ' + (v.nume || '') + ' ' + (v.model || '')).toLowerCase().indexOf(q) >= 0;
    });
    if (!toate.length) { box.innerHTML = '<div class="dm-muted" style="padding:10px 2px">Niciun vehicul în flotă.</div>'; return; }
    if (!l.length) { box.innerHTML = '<div class="dm-muted" style="padding:10px 2px">Niciun vehicul care să se potrivească.</div>'; return; }
    box.innerHTML = l.slice(0, 40).map(function (v) {
      var sub = [v.model, v.categorieEticheta || (v.motiv || '')].filter(Boolean).join(' · ');
      return '<button class="tz-veh' + (_tr.cImei === v.imei ? ' on' : '') + (v.aplicabil ? '' : ' gri') + '"' +
        ' onclick="trAlegeCursa(\'' + esc(v.imei) + '\')">' +
        '<i class="fas fa-truck"></i><span><b>' + esc(v.numar || v.nume || v.imei) + '</b>' +
        (sub ? '<em>' + esc(sub) + '</em>' : '') + '</span>' +
        (_tr.cImei === v.imei ? '<i class="fas fa-check"></i>' : '') + '</button>';
    }).join('') + (l.length > 40 ? '<div class="dm-muted" style="padding:6px 2px">încă ' + (l.length - 40) + ' — scrie ca să filtrezi</div>' : '');
  }

  window.trAlegeCursa = async function (imei) {
    _tr.cImei = imei; _tr.cProfil = null; _tr.cRez = null;
    trListaVehicule();
    var box = el('tr-c-profil');
    box.innerHTML = '<div class="dm-muted" style="margin-top:12px"><i class="fas fa-spinner fa-spin"></i> Se citește fișa vehiculului…</div>';
    // Profilul vine de la SERVER, din fișă. Dacă l-am lua din lista încărcată în browser, cele două
    // s-ar putea despărți tăcut — iar aici se afișează bani.
    var r = await api('/api/tollro/profil/' + encodeURIComponent(imei)).catch(function () { return null; });
    _tr.cProfil = (r && r.vehicul) ? r : null;
    trProfilCursa();
  };

  function trProfilCursa() {
    var box = el('tr-c-profil'); if (!box) return;
    if (!_tr.cImei) { box.innerHTML = '<div class="dm-muted" style="margin-top:10px">Alege un vehicul din listă.</div>'; return; }
    if (!_tr.cProfil) { box.innerHTML = ''; return; }
    var d = _tr.cProfil.vehicul, inc = _tr.cProfil.incadrare;
    // Câmpurile sunt de CITIT, nu de completat. Se schimbă în fișa vehiculului, într-un singur loc.
    var camp = function (et, v, lipsa) {
      return '<div class="tz-f' + (v ? '' : ' gol') + '"><span>' + et + '</span><b>' + esc(v || (lipsa || '—')) + '</b></div>';
    };
    var t = function (kg) { return kg ? (kg / 1000).toLocaleString('ro-RO') + ' t' : null; };
    box.innerHTML =
      '<div class="tz-fise">' +
        camp('Serie șasiu (VIN)', d.vin, 'necompletat în fișă') +
        camp('Masă maximă', t(d.masaKg), 'necompletată în fișă') +
        camp('Număr de axe', d.axe ? String(d.axe) : null, 'necompletat') +
        camp('Clasă de emisii', d.euro, 'necompletată în fișă') +
        camp('Categorie vehicul', d.tip, 'necompletată') +
        camp('Treaptă de taxare', inc ? (_tr.cfg.categorii.find(function (c) { return c.key === inc.categorie; }) || {}).eticheta : null, 'nu se poate încadra') +
      '</div>' +
      '<div class="tz-fise-nota"><i class="fas fa-lock"></i> Datele vin din fișa vehiculului și nu se pot schimba de aici — treapta de taxare se calculează din masă, ca să nu se poată contrazice cu ea. Se corectează din <b>Vehicule → Editare</b>.</div>' +
      (inc
        ? '<div class="tr-nota verde"><i class="fas fa-circle-check"></i> Se taxează cu <b>' +
          inc.leiPerKm.autostrada.toLocaleString('ro-RO', { minimumFractionDigits: 2 }) + ' lei/km</b> pe autostradă și <b>' +
          inc.leiPerKm.national.toLocaleString('ro-RO', { minimumFractionDigits: 2 }) + ' lei/km</b> pe drum național.' +
          (inc.euroCunoscut ? '' : ' Norma de poluare lipsește din fișă — am luat tariful maxim.') + '</div>'
        : '<div class="tr-nota rosu"><i class="fas fa-circle-info"></i> Vehiculul nu se poate încadra la taxare — vezi ce lipsește mai sus.</div>');
  }

  // ── Adrese cu sugestii ──
  // Se caută abia după ce omul se oprește din scris (350 ms). Fără asta, fiecare literă ar însemna o
  // cerere de rețea, iar furnizorul de adrese ne-ar bloca — el permite o cerere pe secundă.
  var _tAdr = {};
  window.trCautaAdresa = function (k) {
    clearTimeout(_tAdr[k]);
    var inp = el('tr-a-' + k), box = el('tr-s-' + k);
    var q = (inp.value || '').trim();
    if (k === 'start') _tr.cStart = null; else _tr.cEnd = null;
    if (q.length < 3) { box.innerHTML = ''; return; }
    box.innerHTML = '<div class="tz-sug-i muted"><i class="fas fa-spinner fa-spin"></i> se caută…</div>';
    _tAdr[k] = setTimeout(async function () {
      var r = await api('/api/tollro/adrese?q=' + encodeURIComponent(q)).catch(function () { return null; });
      if (!r || r.error) { box.innerHTML = '<div class="tz-sug-i rosu">' + esc((r && r.error) || 'Căutarea nu a răspuns.') + '</div>'; return; }
      var s = r.sugestii || [];
      if (!s.length) { box.innerHTML = '<div class="tz-sug-i muted">Nicio adresă găsită.</div>'; return; }
      box.innerHTML = s.map(function (x, i) {
        return '<button class="tz-sug-i" onclick="trAlegeAdresa(\'' + k + '\',' + i + ')"><i class="fas fa-location-dot"></i>' + esc(x.label) + '</button>';
      }).join('');
      box._s = s;
    }, 350);
  };
  window.trAlegeAdresa = function (k, i) {
    var box = el('tr-s-' + k), s = (box._s || [])[i];
    if (!s) return;
    if (k === 'start') _tr.cStart = s; else _tr.cEnd = s;
    el('tr-a-' + k).value = s.label;
    box.innerHTML = '';
  };
  window.trStergeAdresa = function (k) {
    if (k === 'start') _tr.cStart = null; else _tr.cEnd = null;
    el('tr-a-' + k).value = ''; el('tr-s-' + k).innerHTML = '';
    trRenderCursa();
  };

  window.trCalcCursa = async function () {
    var msg = el('tr-c-msg'); msg.className = 'tr-c-msg rosu';
    if (!_tr.cImei) { msg.textContent = 'Alege întâi vehiculul.'; return; }
    if (!_tr.cStart || !_tr.cEnd) { msg.textContent = 'Alege plecarea și destinația din sugestii — nu e destul să le scrii.'; return; }
    var btn = el('tr-c-btn');
    btn.disabled = true; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Se calculează…';
    msg.className = 'tr-c-msg'; msg.textContent = 'Cerem traseul și aflăm din hartă ce fel de drum e fiecare bucată…';
    var r = await postJSON('/api/tollro/cursa', {
      imei: _tr.cImei,
      start: { lat: _tr.cStart.lat, lng: _tr.cStart.lng },
      end: { lat: _tr.cEnd.lat, lng: _tr.cEnd.lng },
    }).catch(function (e) { return { error: (e && e.message) || 'Eroare de rețea' }; });
    btn.disabled = false; btn.innerHTML = '<i class="fas fa-bolt"></i> Calculează ruta și costurile';
    if (!r || r.error) { msg.className = 'tr-c-msg rosu'; msg.textContent = (r && r.error) || 'Nu s-a putut calcula.'; return; }
    msg.textContent = '';
    _tr.cRez = r;
    trRezCursa();
  };

  function trRezCursa() {
    var r = _tr.cRez, box = el('tr-c-rez'); if (!r || !box) return;
    var z = r.rezultat;
    if (!z.aplicabil) {
      box.innerHTML = '<div class="dm-card"><div class="tr-nota rosu"><i class="fas fa-circle-info"></i> ' + esc(z.motiv) + '</div></div>';
      return;
    }
    var kmTaxati = z.linii.reduce(function (a, l) { return a + (l.taxabil ? l.km : 0); }, 0);
    box.innerHTML =
      '<div class="dm-card">' +
        '<div id="tr-c-harta" class="tz-harta"></div>' +
        '<div class="tz-leg">' + z.linii.map(function (l) {
          return '<span><i style="background:' + l.culoare + '"></i>' + esc(l.eticheta) + ' · ' + trKm(l.km) + ' km</span>';
        }).join('') + '</div>' +
        '<div class="tr-tot"><div class="tr-tot-s">' + trNum(z.total) + '<span>lei</span></div>' +
          '<div class="tr-tot-b">' + trKm(r.kmTotal) + ' km în total · ' + trKm(kmTaxati) + ' km pe drum cu taxă</div></div>' +
        z.linii.filter(function (l) { return l.taxabil; }).map(function (l) {
          return '<div class="tz-lin"><i style="background:' + l.culoare + '"></i>' +
            '<span class="tz-l1">' + esc(l.eticheta) + '</span>' +
            '<span class="tz-l2">' + trKm(l.km) + ' km × ' + l.leiPerKm.toLocaleString('ro-RO', { minimumFractionDigits: 2 }) + ' lei</span>' +
            '<span class="tz-l3">' + trNum(l.cost) + '</span></div>';
        }).join('') +
        (z.linii[2] && z.linii[2].km ? '<div class="tz-lin gri"><i style="background:' + z.linii[2].culoare + '"></i>' +
          '<span class="tz-l1">' + esc(z.linii[2].eticheta) + '</span><span class="tz-l2">' + trKm(z.linii[2].km) + ' km</span>' +
          '<span class="tz-l3">—</span></div>' : '') +
        (z.avertismente || []).map(function (a) { return '<div class="tr-nota galben"><i class="fas fa-triangle-exclamation"></i> ' + esc(a) + '</div>'; }).join('') +
        '<div class="dm-muted" style="font-size:11px;margin-top:8px">Costuri estimative — tarifele se stabilesc de autoritățile române și se pot modifica.' +
        (r.atribuire ? ' ' + esc(r.atribuire) + '.' : '') + '</div>' +
      '</div>';
    trDeseneazaHarta(r);
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // Traseul colorat pe bucăți: fiecare segment ia culoarea clasei lui de drum. Asta nu poate face un
  // calculator public — el n-are nici traseul, nici clasificarea.
  function trDeseneazaHarta(r) {
    var host = el('tr-c-harta');
    if (!host || typeof L === 'undefined' || !r.traseu || r.traseu.length < 2) return;
    try { if (_tr.cHarta) { _tr.cHarta.remove(); _tr.cHarta = null; } } catch (e) {}
    var m = L.map(host, { zoomControl: true, attributionControl: false });
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 18 }).addTo(m);
    var cul = {};
    (_tr.cfg && _tr.cfg.claseDrum || []).forEach(function (c) { cul[c.key] = c.culoare; });
    // Culoarea unui segment o dă clasa punctului de la care pleacă — aceeași convenție ca la calcul,
    // altfel harta ar arăta altceva decât spune suma.
    var cls = r.clase || null;
    var pts = r.traseu;
    for (var i = 1; i < pts.length; i++) {
      var k = cls ? cls[i - 1] : null;
      L.polyline([pts[i - 1], pts[i]], { color: cul[k] || '#3b82f6', weight: 5, opacity: .9 }).addTo(m);
    }
    L.circleMarker(pts[0], { radius: 6, color: '#0f172a', fillColor: '#0f172a', fillOpacity: 1 }).addTo(m);
    L.circleMarker(pts[pts.length - 1], { radius: 6, color: '#3FE07D', fillColor: '#3FE07D', fillOpacity: 1 }).addTo(m);
    m.fitBounds(L.latLngBounds(pts), { padding: [18, 18] });
    _tr.cHarta = m;
    setTimeout(function () { try { m.invalidateSize(); } catch (e) {} }, 60);
  }
  // ── sfârșit fila „O cursă nouă" ──


  function trGrilaHtml(g, editabil) {
    var cat = _tr.cfg.categorii, euro = _tr.cfg.euro;
    var h = '<div style="overflow-x:auto"><table class="tr-grid"><thead><tr><th>Masă</th>' +
      euro.map(function (e) { return '<th>' + esc(e.eticheta) + '</th>'; }).join('') + '</tr></thead><tbody>';
    cat.forEach(function (c) {
      h += '<tr><th>' + esc(c.eticheta) + '</th>';
      euro.forEach(function (e) {
        var t = g.tarife[c.key][e.key];
        h += '<td' + (t.presupus ? ' class="presupus" title="Tarif nepublicat oficial — estimarea noastră"' : '') + '>' +
          (editabil
            ? '<input type="number" step="0.01" min="0" max="10" value="' + t.autostrada + '" data-c="' + c.key + '" data-e="' + e.key + '" data-k="autostrada" class="tr-cel">' +
              '<input type="number" step="0.01" min="0" max="10" value="' + t.national + '" data-c="' + c.key + '" data-e="' + e.key + '" data-k="national" class="tr-cel">'
            : '<span>' + t.autostrada + '</span><span>' + t.national + '</span>') +
          (t.presupus ? '<i class="fas fa-triangle-exclamation"></i>' : '') + '</td>';
      });
      h += '</tr>';
    });
    h += '</tbody></table></div><div class="dm-muted" style="font-size:11px;margin-top:6px">Prima cifră = autostradă/drum expres, a doua = drum național (lei/km). ' +
      '<i class="fas fa-triangle-exclamation" style="color:#f59e0b"></i> = tarif nepublicat încă, estimat de noi.</div>';
    if (editabil) h += '<div class="dm-row" style="margin-top:10px;align-items:flex-end;gap:10px">' +
      '<label class="dm-lbl">Se aplică din<input type="date" id="tr-din" class="dm-input" value="' + esc(g.aplicabilDin) + '"></label>' +
      '<button class="rax-btn primary" onclick="trSalveazaGrila()"><i class="fas fa-save"></i> Salvează grila</button></div>';
    return h;
  }

  // Vehiculul se alege acum dintr-un RÂND al listei, nu dintr-un selector. Selectorul rămâne
  // acceptat dacă mai există undeva, ca să nu rup o cale veche.
  window.trAlegeVehicul = async function () {
    var sel = el('tr-veh');
    if (sel) _tr.imei = sel.value;
    var box = el('tr-profil'); if (!box) return;
    if (!_tr.imei) { _tr.profil = null; box.innerHTML = ''; return; }
    box.innerHTML = '<div class="dm-muted"><i class="fas fa-spinner fa-spin"></i> Se citește fișa…</div>';
    // Profilul vine de la SERVER, nu din lista încărcată în browser: pe ecran trebuie să scrie exact
    // datele cu care se face calculul, altfel cele două s-ar putea despărți tăcut.
    var r = await api('/api/tollro/profil/' + encodeURIComponent(_tr.imei)).catch(function () { return null; });
    if (!r || r.error || !r.vehicul) { box.innerHTML = '<div class="tr-nota rosu">' + esc((r && r.error) || 'Nu s-a putut citi fișa vehiculului') + '</div>'; return; }
    _tr.profil = r;
    var d = r.vehicul, masa = d.masaKg || null;
    var lipsa = [];
    if (!masa) lipsa.push('masa maximă autorizată');
    if (!d.euro) lipsa.push('norma de poluare');
    // Un camp pe care fisa il ARE se afiseaza si atat — se modifica in fisa, nu de aici, ca sa nu
    // existe doua adevaruri. Un camp pe care fisa NU il are devine casuta de completat: altfel
    // calculul se blocheaza pe o masina reala doar fiindca cineva n-a apucat sa-i treaca masa.
    var camp = function (et, v) { return '<div class="tr-f"><span>' + et + '</span><b' + (v ? '' : ' class="gol"') + '>' + esc(v || '—') + '</b></div>'; };
    var campEdit = function (et, id, ph, min, max, val) {
      return '<div class="tr-f edit"><span>' + et + ' <i class="fas fa-pen"></i></span>' +
        '<input type="number" id="' + id + '" min="' + min + '" max="' + max + '" step="1" placeholder="' + ph + '"' +
        (val ? ' value="' + val + '"' : '') + ' oninput="trManualSchimbat()"></div>';
    };
    var inc = r.incadrare;
    var potSalva = !!(window.currentUser && (currentUser.isSuper || (currentUser.permissions && currentUser.permissions.manageFleet)));
    box.innerHTML =
      '<div class="tr-profil">' +
        camp('Număr', d.numar) + camp('VIN', d.vin) +
        (masa ? camp('MTMA', (masa / 1000).toLocaleString('ro-RO') + ' t') : campEdit('MTMA (kg)', 'tr-m-masa', 'ex. 30000', 500, 100000, _tr.manual.masaKg)) +
        (d.axe ? camp('Axe', String(d.axe)) : campEdit('Axe', 'tr-m-axe', 'ex. 4', 2, 12, _tr.manual.axe)) +
        camp('Normă', d.euro) +
      '</div>' +
      (masa && masa < 3500
        ? '<div class="tr-nota rosu"><i class="fas fa-circle-info"></i> Sub 3,5 t — vehiculul <b>nu intră la TollRo</b>. Pentru el rămâne rovinieta, plătită pe perioadă.</div>'
        : inc
          ? '<div class="tr-nota verde"><i class="fas fa-circle-check"></i> Se taxează cu <b>' +
            inc.leiPerKm.autostrada.toLocaleString('ro-RO', { minimumFractionDigits: 2 }) + ' lei/km</b> pe autostradă și <b>' +
            inc.leiPerKm.national.toLocaleString('ro-RO', { minimumFractionDigits: 2 }) + ' lei/km</b> pe drum național.' +
            (inc.euroCunoscut ? '' : ' (normă necunoscută → tarif maxim)') + '</div>'
          : '') +
      ((!masa || !d.axe)
        ? '<div class="tr-nota galben"><i class="fas fa-pen"></i> ' +
            (!masa && !d.axe ? 'Masa și numărul de axe lipsesc' : (!masa ? 'Masa maximă autorizată lipsește' : 'Numărul de axe lipsește')) +
            ' din fișa vehiculului — completează-le mai sus ca să poți calcula.' +
            (potSalva ? ' <button class="btn-sm" onclick="trSalveazaInFisa()"><i class="fas fa-save"></i> Salvează în fișă</button>' : '') +
          '</div>' : '') +
      (!d.euro ? '<div class="tr-nota galben"><i class="fas fa-triangle-exclamation"></i> Norma de poluare lipsește din fișă — calculăm la tariful maxim. Se completează din fișa vehiculului.</div>' : '') +
      (d.axe || _tr.manual.axe ? '<div class="dm-muted" style="font-size:11px;margin-top:6px">Numărul de axe nu schimbă suma: grila publicată diferențiază doar după masă și normă Euro. Îl păstrăm pentru cazul în care ordonanța finală îl va folosi.</div>' : '');
  };

  // Ce s-a scris de mana se tine in memorie, ca sa nu se piarda la re-desenare si sa plece odata cu
  // calculul. NU se salveaza singur in fisa — pentru asta e butonul.
  window.trManualSchimbat = function () {
    var m = el('tr-m-masa'), a = el('tr-m-axe');
    _tr.manual.masaKg = m ? m.value : _tr.manual.masaKg;
    _tr.manual.axe = a ? a.value : _tr.manual.axe;
  };

  window.trSalveazaInFisa = async function () {
    trManualSchimbat();
    var body = {};
    if (_tr.manual.masaKg) body.masaKg = parseFloat(_tr.manual.masaKg);
    if (_tr.manual.axe) body.axe = parseFloat(_tr.manual.axe);
    if (!body.masaKg && !body.axe) { toast('Completează întâi valorile', 'error'); return; }
    var r = await api('/api/tollro/profil/' + encodeURIComponent(_tr.imei), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    if (r && r.ok) { toast('Salvat în fișa vehiculului', 'success'); _tr.manual = {}; trAlegeVehicul(); }
    else toast((r && r.error) || 'Nu s-a putut salva', 'error');
  };

  function trCereVehicul() {
    if (!_tr.imei) { toast('Alege întâi vehiculul din flotă', 'error'); return false; }
    return true;
  }

  window.trManual = async function () {
    if (!trCereVehicul()) return;
    var km = { autostrada: parseFloat(el('tr-km-a').value) || 0, national: parseFloat(el('tr-km-n').value) || 0, alte: parseFloat(el('tr-km-x').value) || 0 };
    trManualSchimbat();
    var r = await postJSON('/api/tollro/estimate', { imei: _tr.imei, km: km, manual: _tr.manual });
    trAfiseaza(r, null);
  };

  function trAfiseaza(r, atribuire) {
    var box = el('tr-rezultat'); if (!box) return;
    if (!r || r.error) { box.innerHTML = '<h3>Detalii costuri</h3><div class="tr-nota rosu"><i class="fas fa-circle-exclamation"></i> ' + esc((r && r.error) || 'Eroare la calcul') + '</div>'; return; }
    var z = r.rezultat;
    if (!z) { box.innerHTML = '<h3>Detalii costuri</h3><div class="dm-muted">Fără rezultat.</div>'; return; }
    if (!z.aplicabil) {
      box.innerHTML = '<h3>Detalii costuri</h3><div class="tr-nota rosu"><i class="fas fa-circle-info"></i> ' + esc(z.motiv) + '</div>';
      return;
    }
    var maxCost = Math.max.apply(null, z.linii.map(function (l) { return l.cost; }).concat([0.01]));
    var kmTotal = z.linii.reduce(function (a, l) { return a + l.km; }, 0);
    box.innerHTML =
      '<h3>Detalii costuri <span class="dm-muted" style="font-weight:400;font-size:12px">· ' + esc(z.categorieEticheta) + ' · ' + esc(z.euroEticheta) + '</span></h3>' +
      '<div class="tr-sumar"><div><span>Distanță totală</span><b>' + trKm(kmTotal) + ' km</b></div>' +
        '<div class="tot"><span>Total</span><b>' + trNum(z.total) + ' ' + esc(z.moneda) + '</b></div></div>' +
      z.linii.map(function (l) {
        return '<div class="tr-linie">' +
          '<div class="cap"><span class="pct" style="background:' + l.culoare + '"></span>' + esc(l.eticheta) +
            '<b>' + (l.taxabil ? trNum(l.cost) + ' ' + esc(z.moneda) : 'netaxat') + '</b></div>' +
          '<div class="sub">' + trKm(l.km) + ' km' + (l.taxabil ? ' · ' + l.leiPerKm.toLocaleString('ro-RO', { minimumFractionDigits: 2 }) + ' lei/km' : '') + '</div>' +
          '<div class="bara"><i style="width:' + Math.round((l.cost / maxCost) * 100) + '%;background:' + l.culoare + '"></i></div>' +
        '</div>';
      }).join('') +
      (r.kmNecunoscut ? '' : '') +
      (z.avertismente || []).map(function (a) { return '<div class="tr-nota galben"><i class="fas fa-triangle-exclamation"></i> ' + esc(a) + '</div>'; }).join('') +
      '<div class="dm-muted" style="font-size:11px;margin-top:8px">Costuri estimative — tarifele se stabilesc de autoritățile române și se pot modifica.' +
      (r.sursa ? ' Sursa kilometrilor: ' + esc(r.sursa) + '.' : '') + (atribuire ? ' ' + esc(atribuire) + '.' : '') + '</div>';
  }

  window.trSalveazaGrila = async function () {
    var g = { aplicabilDin: el('tr-din').value, tarife: {} };
    document.querySelectorAll('.tr-cel').forEach(function (i) {
      var c = i.getAttribute('data-c'), e = i.getAttribute('data-e'), k = i.getAttribute('data-k');
      g.tarife[c] = g.tarife[c] || {}; g.tarife[c][e] = g.tarife[c][e] || {};
      g.tarife[c][e][k] = parseFloat(i.value);
    });
    var r = await api('/api/tollro/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ grila: g }) });
    if (r && r.ok) { _tr.cfg.grila = r.grila; toast('Grila de tarife a fost salvată', 'success'); trRender(); }
    else toast((r && r.error) || 'Nu s-a putut salva', 'error');
  };

  /* ═══════════════ MODUL 3: Tahograf ═══════════════ */
  var _tachoChart = null;
  window.openTahografDemo = async function () {
    ensureContainers();
    var cfg = await api('/api/demo-modules/config').catch(function () { return {}; });
    el('tahograf-view-mode').innerHTML = modeBadge((cfg.tahograf && cfg.tahograf.mode) || 'demo');
    var drivers = await api('/api/tacho-status').catch(function () { return []; }); if (!Array.isArray(drivers)) drivers = [];
    el('tahograf-view-body').innerHTML =
      '<div class="dm-card"><h3>Șoferi — descărcare card (ciclu 28 zile)</h3>' +
      (drivers.length ? drivers.map(tachoDriverRow).join('') : '<div class="dm-muted">Niciun șofer. Adaugă șoferi în Administrare → Șoferi.</div>') + '</div>' +
      '<div class="dm-card" id="tacho-analysis" style="margin-top:14px;display:none;"></div>';
  };
  function tachoDriverRow(d) {
    var col = d.status === 'overdue' ? 'var(--red)' : (d.status === 'due_soon' ? 'var(--orange)' : 'var(--accent)');
    var label = d.status === 'overdue' ? 'DEPĂȘIT' : (d.lastDownload ? (d.daysLeft + ' zile rămase') : 'niciodată descărcat');
    return '<div class="dm-driver">' +
      '<div class="dm-driver-top"><b>' + esc(d.driver) + '</b><span class="dm-pill" style="background:' + col + '22;color:' + col + '">' + esc(label) + '</span></div>' +
      '<div class="dm-progress"><div class="dm-progress-bar" style="width:' + d.progressPct + '%;background:' + col + '"></div></div>' +
      '<div class="dm-driver-bot"><span class="dm-muted">' + (d.lastDownload ? 'ultima descărcare: ' + new Date(d.lastDownload).toLocaleDateString('ro-RO') : 'fără descărcare') + '</span>' +
      '<button class="dm-btn primary sm" id="tdl-' + d.driverId + '" onclick="tachoDownload(' + d.driverId + ',\'' + esc(d.driver) + '\')"><i class="fas fa-flask"></i> Generează analiză demonstrativă</button></div>' +
      '<div class="dm-dl-prog" id="tdlp-' + d.driverId + '" style="display:none"><div class="dm-dl-prog-bar"></div><span class="dm-dl-txt"></span></div>' +
    '</div>';
  }
  window.tachoDownload = async function (driverId, name) {
    var btn = el('tdl-' + driverId), prog = el('tdlp-' + driverId), bar = prog.querySelector('.dm-dl-prog-bar'), txt = prog.querySelector('.dm-dl-txt');
    btn.disabled = true; prog.style.display = 'flex';
    // FĂRĂ pași falși de conectare: nu simulăm o descărcare reală prin K-Line care nu are loc.
    // Arătăm doar starea reală a cererii; dacă modul e „real", serverul răspunde 501 și userul află imediat.
    bar.style.width = '60%'; txt.textContent = 'Se generează analiza demonstrativă…';
    var res = await postJSON('/api/tacho-download/' + driverId, {});
    btn.disabled = false; prog.style.display = 'none'; bar.style.width = '0';
    if (res.error) { toast(res.error, 'error'); return; }
    renderTachoAnalysis(res.analysis);
    openTahografDemo(); // refresh indicatoare (status resetat)
  };
  function renderTachoAnalysis(a) {
    var box = el('tacho-analysis'); if (!box) return;
    box.style.display = 'block';
    var viol = (a.violations || []).map(function (v) { return '<div class="dm-viol"><span class="dm-dot"></span><b>' + esc(v.rule) + '</b> — ' + esc(v.detail) + '</div>'; }).join('') || '<div class="dm-muted">Nicio încălcare detectată.</div>';
    var segs = (a.segments || []).map(function (s) {
      var c = s.activity === 'DRIVING' ? '#3FE07D' : (s.activity === 'REST' ? '#60a5fa' : '#eab308');
      return '<div class="dm-seg" title="' + s.activity + ' ' + s.from + '–' + s.to + '" style="flex:' + s.min + ';background:' + c + '"></div>';
    }).join('');
    box.innerHTML = '<h3>Analiză card — ' + esc(a.driver) + ' <span class="dm-muted" style="font-size:11px">(' + esc(a.date) + ')</span></h3>' +
      '<div class="dm-grid2">' +
        '<div><div class="dm-seg-bar">' + segs + '</div>' +
        '<div class="dm-legend"><span><i style="background:#3FE07D"></i>Condus</span><span><i style="background:#60a5fa"></i>Odihnă</span><span><i style="background:#eab308"></i>Lucru</span></div>' +
        '<canvas id="tacho-chart" height="150"></canvas></div>' +
        '<div><div class="dm-stat"><b>' + a.totals.drivingH + 'h</b> condus</div><div class="dm-stat"><b>' + a.totals.restMin + ' min</b> odihnă</div>' +
        '<h4 style="margin:12px 0 6px;color:var(--red)"><i class="fas fa-triangle-exclamation"></i> Încălcări</h4>' + viol +
        '<div class="dm-muted" style="font-size:11px;margin-top:10px">' + esc(a.source) + '</div></div>' +
      '</div>';
    var ctx = el('tacho-chart');
    if (ctx && window.Chart) {
      if (_tachoChart) _tachoChart.destroy();
      _tachoChart = new Chart(ctx, { type: 'doughnut', data: { labels: ['Condus', 'Odihnă', 'Lucru'], datasets: [{ data: [a.totals.drivingMin, a.totals.restMin, a.totals.workMin], backgroundColor: ['#3FE07D', '#60a5fa', '#eab308'] }] }, options: { plugins: { legend: { position: 'bottom' } } } });
    }
    box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  // inject containerele cât mai devreme
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', ensureContainers); else ensureContainers();
})();
