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
  var _tr = { cfg: null, imei: '', profil: null, sursa: 'istoric', rezultat: null, manual: {} };

  window.openEtollDemo = async function () {
    ensureContainers();
    _tr.cfg = await api('/api/tollro/config').catch(function () { return null; });
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

  function trRender() {
    var azi = new Date().toISOString().slice(0, 10);
    var acum7 = new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);
    var g = _tr.cfg && _tr.cfg.grila;
    el('etoll-view-body').innerHTML =
      '<div class="dm-card">' +
        '<h3>Vehiculul</h3>' +
        '<div class="dm-row" style="align-items:center;flex-wrap:wrap">' +
          '<select id="tr-veh" class="dm-input" style="min-width:230px" onchange="trAlegeVehicul()">' + vehicleOptions() + '</select>' +
          '<span class="dm-muted" style="font-size:11.5px">Doar vehiculele din flota ta — profilul se ia din fișă.</span>' +
        '</div>' +
        '<div id="tr-profil" style="margin-top:10px"></div>' +
      '</div>' +

      '<div class="dm-card">' +
        '<h3>Kilometrii</h3>' +
        '<div class="tr-tabs">' +
          '<button class="tr-tab' + (_tr.sursa === 'istoric' ? ' on' : '') + '" onclick="trSursa(\'istoric\')"><i class="fas fa-route"></i> Din traseul parcurs</button>' +
          '<button class="tr-tab' + (_tr.sursa === 'manual' ? ' on' : '') + '" onclick="trSursa(\'manual\')"><i class="fas fa-keyboard"></i> Îi introduc eu</button>' +
        '</div>' +
        (_tr.sursa === 'istoric'
          ? '<div class="dm-row" style="align-items:flex-end;flex-wrap:wrap;gap:10px">' +
              '<label class="dm-lbl">De la<input type="date" id="tr-de-la" class="dm-input" value="' + acum7 + '" max="' + azi + '"></label>' +
              '<label class="dm-lbl">Până la<input type="date" id="tr-pana-la" class="dm-input" value="' + azi + '" max="' + azi + '"></label>' +
              '<button class="rax-btn primary" onclick="trDinIstoric()"><i class="fas fa-calculator"></i> Calculează din traseu</button>' +
            '</div>' +
            '<div class="dm-muted" style="font-size:11.5px;margin-top:6px">Luăm traseul real al mașinii și, pentru fiecare bucată, aflăm din OpenStreetMap ce fel de drum e. Maxim 8 zile odată.</div>'
          : '<div class="dm-row" style="align-items:flex-end;flex-wrap:wrap;gap:10px">' +
              '<label class="dm-lbl">Autostradă / expres (km)<input type="number" id="tr-km-a" class="dm-input" min="0" step="0.1" placeholder="0"></label>' +
              '<label class="dm-lbl">Drum național (km)<input type="number" id="tr-km-n" class="dm-input" min="0" step="0.1" placeholder="0"></label>' +
              '<label class="dm-lbl">Alte drumuri (km)<input type="number" id="tr-km-x" class="dm-input" min="0" step="0.1" placeholder="0"></label>' +
              '<button class="rax-btn primary" onclick="trManual()"><i class="fas fa-calculator"></i> Calculează</button>' +
            '</div>') +
      '</div>' +

      '<div class="dm-card" id="tr-rezultat"><h3>Detalii costuri</h3>' +
        '<div class="dm-muted">Alege vehiculul și perioada, apoi apasă „Calculează".</div></div>' +

      (g ? '<div class="dm-card"><h3>Grila de tarife' + (_tr.cfg.editabil ? '' : ' (doar informativ)') + '</h3>' +
        '<div class="dm-muted" style="font-size:11.5px;margin-bottom:8px">Se aplică din <b>' + esc(trData(g.aplicabilDin)) + '</b>. ' +
        'Valorile se stabilesc prin ordonanță și s-au tot amânat — de aceea stau aici, editabile, nu îngropate în cod.</div>' +
        trGrilaHtml(g, _tr.cfg.editabil) + '</div>' : '');
    if (_tr.imei) { var sel = el('tr-veh'); if (sel) sel.value = _tr.imei; trAlegeVehicul(); }
  }

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

  window.trSursa = function (s) { _tr.sursa = s; trRender(); };

  window.trAlegeVehicul = async function () {
    var sel = el('tr-veh'); if (!sel) return;
    _tr.imei = sel.value;
    var box = el('tr-profil'); if (!box) return;
    _tr.manual = {};   // alt vehicul, alte date — nu caram masa camionului dinainte
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

  window.trDinIstoric = async function () {
    if (!trCereVehicul()) return;
    var box = el('tr-rezultat');
    box.innerHTML = '<h3>Detalii costuri</h3><div class="dm-muted"><i class="fas fa-spinner fa-spin"></i> Se citește traseul și se întreabă OpenStreetMap ce fel de drumuri sunt… poate dura până la un minut.</div>';
    trManualSchimbat();
    var from = el('tr-de-la').value, to = el('tr-pana-la').value;
    var r = await postJSON('/api/tollro/din-istoric', { imei: _tr.imei, from: from + 'T00:00:00', to: to + 'T23:59:59', manual: _tr.manual });
    trAfiseaza(r, r && r.atribuire);
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
