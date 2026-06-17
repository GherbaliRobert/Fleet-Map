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
     ['etoll-view', 'fa-road', 'E-Toll & Roviniete'],
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

  /* ═══════════════ MODUL 2: E-Toll & Roviniete ═══════════════ */
  var _etollChart = null;
  window.openEtollDemo = async function () {
    ensureContainers();
    var cfg = await api('/api/demo-modules/config').catch(function () { return {}; });
    el('etoll-view-mode').innerHTML = modeBadge((cfg.etoll && cfg.etoll.mode) || 'demo');
    var docs = await api('/api/documents').catch(function () { return []; }); if (!Array.isArray(docs)) docs = [];
    var prov = await api('/api/etoll/providers').catch(function () { return { providers: [], selected: '' }; });
    el('etoll-view-body').innerHTML =
      '<div class="dm-grid2">' +
        '<div class="dm-card"><h3>Acte vehicul (Rovinietă / RCA / ITP)</h3>' +
          '<div class="dm-row"><select id="etoll-doc-veh" class="dm-input" style="flex:1">' + vehicleOptions() + '</select>' +
          '<select id="etoll-doc-type" class="dm-input" style="width:130px"><option>ROVINIETA</option><option>RCA</option><option>ITP</option></select>' +
          '<input id="etoll-doc-exp" type="date" class="dm-input" style="width:150px"></div>' +
          '<button class="dm-btn primary" onclick="etollAddDoc()"><i class="fas fa-plus"></i> Adaugă</button>' +
          '<div id="etoll-docs" style="margin-top:10px;">' + etollDocsHtml(docs) + '</div>' +
        '</div>' +
        '<div class="dm-card"><h3>E-Toll Europa — costuri estimate</h3>' +
          '<div class="dm-row" style="align-items:center"><label class="dm-lbl" style="margin:0">Furnizor extern:</label>' +
          '<select id="etoll-provider" class="dm-input" style="width:160px" onchange="etollSetProvider()"><option value="">— niciunul —</option>' +
          (prov.providers || []).map(function (p) { return '<option' + (p === prov.selected ? ' selected' : '') + '>' + esc(p) + '</option>'; }).join('') + '</select></div>' +
          '<div class="dm-toll-total" id="etoll-total"></div>' +
          '<canvas id="etoll-chart" height="150"></canvas>' +
          '<div class="dm-muted" id="etoll-src" style="font-size:11px;margin-top:6px"></div>' +
        '</div>' +
      '</div>';
    etollLoadCosts();
  };
  function etollDocsHtml(docs) {
    docs = docs.filter(function (d) { return ['ROVINIETA', 'RCA', 'ITP'].indexOf(String(d.doc_type).toUpperCase()) >= 0; });
    if (!docs.length) return '<div class="dm-muted">Niciun act adăugat. Adaugă datele de expirare ca să primești alerte la 7/3/1 zile.</div>';
    var now = Date.now();
    return '<table class="dm-table"><thead><tr><th>Tip</th><th>Vehicul</th><th>Expiră</th><th>Stare</th></tr></thead><tbody>' +
      docs.map(function (d) {
        var days = d.expiry_date ? Math.ceil((new Date(d.expiry_date).getTime() - now) / 86400000) : null;
        var cls = days == null ? '' : (days < 0 ? 'danger' : (days <= 3 ? 'danger' : (days <= 7 ? 'warn' : 'ok')));
        var txt = days == null ? '-' : (days < 0 ? 'EXPIRAT (' + (-days) + 'z)' : days + ' zile');
        return '<tr><td><b>' + esc(d.doc_type) + '</b></td><td>' + esc(d.imei || '-') + '</td><td>' + (d.expiry_date ? new Date(d.expiry_date).toLocaleDateString('ro-RO') : '-') + '</td><td><span class="dm-pill ' + cls + '">' + esc(txt) + '</span></td></tr>';
      }).join('') + '</tbody></table>';
  }
  window.etollAddDoc = async function () {
    var imei = el('etoll-doc-veh').value, type = el('etoll-doc-type').value, exp = el('etoll-doc-exp').value;
    if (!imei || !exp) return toast('Alege vehicul + dată expirare', 'error');
    await postJSON('/api/documents', { imei: imei, doc_type: type, expiry_date: exp });
    toast('Document adăugat ✓', 'success'); openEtollDemo();
  };
  window.etollSetProvider = async function () {
    var p = el('etoll-provider').value;
    await api('/api/etoll/provider', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ provider: p }) });
    toast(p ? ('Furnizor: ' + p) : 'Furnizor deconectat', 'success');
  };
  async function etollLoadCosts() {
    var c = await api('/api/etoll/costs?days=30').catch(function () { return null; }); if (!c) return;
    el('etoll-total').innerHTML = '<b>' + c.totalEur.toLocaleString('ro-RO') + ' €</b> / 30 zile · ' + c.totalKm.toLocaleString('ro-RO') + ' km';
    el('etoll-src').textContent = c.source;
    var ctx = el('etoll-chart'); if (!ctx || !window.Chart) return;
    if (_etollChart) _etollChart.destroy();
    _etollChart = new Chart(ctx, {
      type: 'bar',
      data: { labels: c.perCountry.map(function (x) { return x.country; }), datasets: [{ label: 'Cost (€)', data: c.perCountry.map(function (x) { return x.costEur; }), backgroundColor: '#3FE07D' }] },
      options: { plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } }
    });
  }

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
      '<button class="dm-btn primary sm" id="tdl-' + d.driverId + '" onclick="tachoDownload(' + d.driverId + ',\'' + esc(d.driver) + '\')"><i class="fas fa-download"></i> Descarcă card la distanță</button></div>' +
      '<div class="dm-dl-prog" id="tdlp-' + d.driverId + '" style="display:none"><div class="dm-dl-prog-bar"></div><span class="dm-dl-txt"></span></div>' +
    '</div>';
  }
  window.tachoDownload = async function (driverId, name) {
    var btn = el('tdl-' + driverId), prog = el('tdlp-' + driverId), bar = prog.querySelector('.dm-dl-prog-bar'), txt = prog.querySelector('.dm-dl-txt');
    btn.disabled = true; prog.style.display = 'flex';
    // bară de progres 5s ca și cum se descarcă prin GPS (K-Line/tacho)
    var steps = ['Conectare la tahograf (K-Line)…', 'Autentificare card companie…', 'Descărcare blocuri activitate…', 'Verificare semnătură digitală…', 'Analiză Reg. 561/2006…'];
    for (var i = 0; i < steps.length; i++) {
      bar.style.width = ((i + 1) / steps.length * 100) + '%'; txt.textContent = steps[i];
      await new Promise(function (r) { setTimeout(r, 1000); });
    }
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
