// weekly-report-ui.js — Raport săptămânal de flotă.
// Flux: alegi compania → apar calendarul și „Generează" → generezi → apare raportul și butonul „Istoric".
// Nimic nu se generează sau se afișează automat. O săptămână deja generată NU se reface — doar te anunțăm.
(function () {
  'use strict';
  var _state = { canManage: false, enabled: true, recipients: [], current: null,
                 history: [], week: null, calMonth: null, companyId: null, isSuper: false };

  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(n) { var v = Number(n); return isNaN(v) ? '0' : v.toLocaleString('ro-RO'); }
  function hm(sec) { sec = Number(sec) || 0; if (!sec) return ''; var h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60); return h + 'h ' + (m < 10 ? '0' : '') + m + 'm'; }
  // Funcția de mesaje a aplicației e raxToast (window.toast nu există — apelurile către ea erau mute).
  function say(msg, kind) { if (window.raxToast) window.raxToast(msg, kind || 'success'); }

  // ─── Săptămâna: Luni→Luni UTC, identic cu weekly_report.lastCompletedWeek de pe server ───
  var RO_LUNI = ['ianuarie','februarie','martie','aprilie','mai','iunie','iulie','august','septembrie','octombrie','noiembrie','decembrie'];
  var RO_LUNI_S = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','noi','dec'];
  var RO_ZILE = ['L','M','M','J','V','S','D'];
  function mondayUTC(d) { var day = d.getUTCDay(), off = (day === 0 ? 6 : day - 1); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - off)); }
  function weekOf(d) { var m = mondayUTC(d); return { from: m.toISOString(), to: new Date(m.getTime() + 7 * 864e5).toISOString() }; }
  function lastFullWeek() { return weekOf(new Date(mondayUTC(new Date()).getTime() - 864e5)); }
  function weekLabel(w) {
    var a = new Date(w.from), b = new Date(new Date(w.to).getTime() - 864e5);
    var same = a.getUTCMonth() === b.getUTCMonth();
    return a.getUTCDate() + (same ? '' : ' ' + RO_LUNI_S[a.getUTCMonth()]) + ' – ' + b.getUTCDate() + ' ' + RO_LUNI_S[b.getUTCMonth()] + ' ' + b.getUTCFullYear();
  }
  function dayKey(iso) { return String(iso).slice(0, 10); }
  function reportFor(w) {
    if (!w) return null;
    var k = dayKey(w.from);
    return (_state.history || []).filter(function (x) { return dayKey(x.period_from) === k; })[0] || null;
  }

  // ─── Schelet ───
  function ensureSkeleton() {
    var host = el('weekly-report-view'); if (!host) return null;
    if (el('wr-body')) return host;
    host.innerHTML =
      '<div class="modal" style="width:1180px;max-width:97vw;max-height:94vh;display:flex;flex-direction:column;">' +
        '<h2 style="flex:0 0 auto;"><span><i class="fas fa-chart-line" style="margin-right:8px;color:var(--accent);"></i> Raport săptămânal flotă</span>' +
          '<button class="close-btn" onclick="showView(\'localizare\')" style="position:static;font-size:18px;">&#10005;</button></h2>' +
        '<div class="wr-toolbar" id="wr-tools">' +
          '<select id="wr-company" class="rax-field" style="width:auto;min-width:180px;margin:0;display:none;" onchange="wrSetCompany(this.value)"></select>' +
          '<div class="wr-pw" id="wr-pw-cal" style="display:none;">' +
            '<button type="button" class="wr-cbtn" onclick="wrCalToggle(event)">' +
              '<i class="fas fa-calendar-days"></i> <span id="wr-weeklbl">Alege săptămâna</span> <i class="fas fa-chevron-down" style="font-size:9px;opacity:.7;"></i>' +
            '</button><div class="wr-pop wr-cal" id="wr-cal"></div>' +
          '</div>' +
          '<button type="button" id="wr-gen-btn" class="wr-genbtn btn-primary" style="display:none;" onclick="wrGenerate(this)"><i class="fas fa-bolt"></i> Generează</button>' +
          '<div class="wr-pw" id="wr-pw-hist" style="display:none;">' +
            '<button type="button" class="wr-cbtn" onclick="wrHistToggle(event)"><i class="fas fa-clock-rotate-left"></i> Istoric <span id="wr-histn" class="wr-cnt"></span></button>' +
            '<div class="wr-pop wr-hist" id="wr-hist"></div>' +
          '</div>' +
          '<span id="wr-period" class="wr-period"></span>' +
          '<span style="flex:1"></span>' +
          '<span id="wr-admin" class="wr-admin" style="display:none;"></span>' +
        '</div>' +
        '<div id="wr-body" style="overflow:auto;flex:1;min-height:0;padding-right:4px;"></div>' +
      '</div>';
    document.addEventListener('click', function (e) {
      var t = el('wr-tools'); if (t && !t.contains(e.target)) closePops();
    });
    return host;
  }

  // ─── Bara de sus ───
  function syncToolbar() {
    var ready = !(_state.isSuper && !_state.companyId);          // super-admin fără companie → nimic
    var cal = el('wr-pw-cal'), gen = el('wr-gen-btn'), hist = el('wr-pw-hist');
    if (cal)  cal.style.display  = (ready && _state.canManage) ? '' : 'none';
    if (gen)  gen.style.display  = (ready && _state.canManage) ? '' : 'none';
    // „Istoric" apare DOAR când chiar există rapoarte
    if (hist) hist.style.display = (ready && (_state.history || []).length) ? '' : 'none';
    var n = el('wr-histn'); if (n) n.textContent = (_state.history || []).length || '';
    var lbl = el('wr-weeklbl'); if (lbl) lbl.textContent = _state.week ? weekLabel(_state.week) : 'Alege săptămâna';
  }
  function closePops() { ['wr-cal', 'wr-hist'].forEach(function (id) { var x = el(id); if (x) x.style.display = 'none'; }); }

  // ─── Calendar propriu, în română (cel din browser afișează mereu „Week 32, 2026") ───
  window.wrCalToggle = function (e) {
    if (e) e.stopPropagation();
    var p = el('wr-cal'); if (!p) return;
    var open = p.style.display !== 'block';
    closePops(); if (open) { p.style.display = 'block'; renderCal(); }
  };
  function renderCal() {
    var p = el('wr-cal'); if (!p) return;
    var base = _state.calMonth ? new Date(_state.calMonth) : new Date(_state.week ? _state.week.from : Date.now());
    var y = base.getUTCFullYear(), m = base.getUTCMonth();
    _state.calMonth = Date.UTC(y, m, 1);
    var first = mondayUTC(new Date(Date.UTC(y, m, 1)));
    var thisMon = mondayUTC(new Date());
    var sel = _state.week ? dayKey(_state.week.from) : null;

    var rows = '';
    for (var r = 0; r < 6; r++) {
      var ws = new Date(first.getTime() + r * 7 * 864e5);
      if (r > 0 && ws.getUTCMonth() !== m && ws.getTime() > Date.UTC(y, m, 1)) break;
      var key = dayKey(ws.toISOString());
      var future = ws.getTime() >= thisMon.getTime();          // săptămâna curentă/viitoare: neîncheiată
      var has = !!reportFor({ from: ws.toISOString() });
      var cells = '';
      for (var i = 0; i < 7; i++) {
        var d = new Date(ws.getTime() + i * 864e5);
        cells += '<span class="wr-cd' + (d.getUTCMonth() === m ? '' : ' out') + '">' + d.getUTCDate() + '</span>';
      }
      rows += '<button type="button" class="wr-cw' + (key === sel ? ' sel' : '') + (future ? ' off' : '') + '"' +
        (future ? ' disabled title="Săptămâna nu s-a încheiat încă"'
                : ' onclick="wrCalPick(event, \'' + ws.toISOString() + '\')"') + '>' +
        cells + '<span class="wr-cflag" title="Are deja raport">' + (has ? '✓' : '') + '</span></button>';
    }
    p.innerHTML =
      '<div class="wr-cnav"><button type="button" onclick="wrCalMove(event,-1)" aria-label="Luna anterioară">‹</button>' +
        '<b>' + RO_LUNI[m] + ' ' + y + '</b>' +
        '<button type="button" onclick="wrCalMove(event,1)" aria-label="Luna următoare">›</button></div>' +
      '<div class="wr-chead">' + RO_ZILE.map(function (z) { return '<span>' + z + '</span>'; }).join('') + '<span></span></div>' +
      rows +
      '<div class="wr-chint">Alegi o săptămână întreagă (luni–duminică). ✓ = are deja raport.</div>';
  }
  window.wrCalMove = function (e, dir) {
    if (e) e.stopPropagation();
    var d = new Date(_state.calMonth);
    _state.calMonth = Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + dir, 1);
    renderCal();
  };
  window.wrCalPick = function (e, iso) {
    if (e) e.stopPropagation();
    _state.week = weekOf(new Date(iso));
    closePops(); syncToolbar();
  };

  // ─── Istoric (panou la cerere) ───
  window.wrHistToggle = function (e) {
    if (e) e.stopPropagation();
    var p = el('wr-hist'); if (!p) return;
    var open = p.style.display !== 'block';
    closePops(); if (!open) return;
    p.style.display = 'block';
    var list = _state.history || [];
    p.innerHTML = list.length ? list.map(function (w, i) {
      var k = (w.data && w.data.kpi) || {};
      var meta = (k.totalKm != null ? num(Math.round(k.totalKm)) + ' km' : '') + (k.vehiclesActive != null ? ' · ' + k.vehiclesActive + ' active' : '');
      return '<button type="button" class="wr-hrow" onclick="wrOpenReport(event,' + w.id + ')">' +
        '<span class="wr-hdot"' + (i === 0 ? ' data-last="1"' : '') + '></span>' +
        '<span class="wr-hper">' + esc(weekLabel({ from: w.period_from, to: w.period_to })) + '</span>' +
        '<span class="wr-hkpi">' + esc(meta) + '</span></button>';
    }).join('') : '<div class="wr-hempty">Niciun raport încă.</div>';
  };
  window.wrOpenReport = function (e, id) {
    if (e) e.stopPropagation();
    closePops();
    var body = el('wr-body'); if (body) body.innerHTML = '<div class="wr-loading">Se încarcă…</div>';
    fetch('/api/weekly-report/' + parseInt(id), { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (w) { if (w && w.data) { _state.current = w; render(w); } else renderEmpty(); })
      .catch(function () { renderEmpty(); });
  };

  // ─── Generare ───
  window.wrGenerate = function (btn) {
    var w = _state.week;
    if (!w) { say('Alege mai întâi o săptămână din calendar', 'error'); return; }
    if (new Date(w.from).getTime() >= mondayUTC(new Date()).getTime()) {
      say('Săptămâna ' + weekLabel(w) + ' nu s-a încheiat încă', 'error'); return;
    }
    var exists = reportFor(w);
    if (exists) { say('Săptămâna ' + weekLabel(w) + ' are deja raport — îl găsești în Istoric', 'info'); return; }

    var payload = { from: w.from, to: w.to };
    if (_state.companyId) payload.companyId = _state.companyId;
    if (btn) { btn.disabled = true; btn.dataset._t = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Se generează…'; }
    fetch('/api/weekly-report/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset._t || '<i class="fas fa-bolt"></i> Generează'; }
        if (j && j.report) {
          _state.current = j.report;
          if (!Array.isArray(_state.history)) _state.history = [];
          _state.history.unshift(j.report);     // apare în Istoric și bifat ✓ în calendar
          syncToolbar();
          render(j.report);
          say('Raport generat pentru ' + weekLabel(w));
        } else say((j && j.error) || 'Eroare la generare', 'error');
      })
      .catch(function (err) {
        if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset._t || '<i class="fas fa-bolt"></i> Generează'; }
        say('Eroare de rețea la generare', 'error');
      });
  };

  // ─── Încărcare ───
  window.openWeeklyReport = function () {
    var host = ensureSkeleton(); if (!host) return;
    loadLatest(_state.companyId || null);
  };
  window.wrSetCompany = function (v) { _state.companyId = v ? parseInt(v) : null; _state.history = []; loadLatest(_state.companyId); };

  function loadLatest(companyId) {
    var body = el('wr-body'); if (body) body.innerHTML = '<div class="wr-loading">Se încarcă…</div>';
    var qs = companyId ? ('?companyId=' + encodeURIComponent(companyId)) : '';
    fetch('/api/weekly-report/latest' + qs, { credentials: 'same-origin' })
      .then(function (r) { if (r.status === 403) throw new Error('forbidden'); return r.json(); })
      .then(function (d) {
        _state.canManage = !!d.canManage; _state.enabled = (d.enabled !== false); _state.recipients = d.recipients || [];
        _state.isSuper = !!d.isSuper; _state.companyId = d.companyId || companyId || null;
        ensureCompanyPicker(); renderAdmin();
        if (_state.isSuper && !_state.companyId) { syncToolbar(); renderPickCompany(); return; }
        if (!_state.week) _state.week = lastFullWeek();
        syncToolbar();
        renderEmpty();                                   // NU afișăm nimic automat
        var hq = '?limit=26' + (_state.companyId ? '&companyId=' + encodeURIComponent(_state.companyId) : '');
        fetch('/api/weekly-reports' + hq, { credentials: 'same-origin' })
          .then(function (r) { return r.json(); })
          .then(function (l) { _state.history = Array.isArray(l) ? l : []; syncToolbar(); })
          .catch(function () {});
      })
      .catch(function (e) {
        var b = el('wr-body');
        if (b) b.innerHTML = '<div class="wr-empty">' + (e.message === 'forbidden'
          ? 'Raportul de flotă e disponibil doar pentru administratori și manageri.'
          : 'Nu am putut încărca raportul.') + '</div>';
      });
  }
  function renderEmpty() {
    var body = el('wr-body'); if (!body) return;
    body.innerHTML = '<div class="wr-empty"><i class="fas fa-calendar-days" style="font-size:34px;color:var(--text-muted);margin-bottom:10px;"></i>' +
      '<div>Alege o săptămână din calendar și apasă <b>Generează</b>.</div>' +
      '<div style="color:var(--text-muted);font-size:13px;margin-top:6px;">Raportul se face oricum automat în fiecare luni, pentru săptămâna încheiată.</div></div>';
    var p = el('wr-period'); if (p) p.textContent = '';
  }
  function renderPickCompany() {
    var body = el('wr-body'); if (!body) return;
    body.innerHTML = '<div class="wr-empty"><i class="fas fa-building" style="font-size:34px;color:var(--text-muted);margin-bottom:10px;"></i>' +
      '<div>Alege o companie din selectorul de sus.</div></div>';
    var p = el('wr-period'); if (p) p.textContent = '';
  }
  function ensureCompanyPicker() {
    var sel = el('wr-company'); if (!sel || !_state.isSuper) return;
    sel.style.display = '';
    if (sel.options.length) { sel.value = _state.companyId || ''; return; }
    fetch('/api/companies', { credentials: 'same-origin' }).then(function (r) { return r.ok ? r.json() : []; })
      .then(function (list) {
        sel.innerHTML = '<option value="">— alege compania —</option>' +
          (Array.isArray(list) ? list : []).map(function (c) { return '<option value="' + c.id + '">' + esc(c.name || ('#' + c.id)) + '</option>'; }).join('');
        sel.value = _state.companyId || '';
      }).catch(function () {});
  }
  function renderAdmin() {
    var box = el('wr-admin'); if (!box) return;
    if (!_state.canManage || (_state.isSuper && !_state.companyId)) { box.style.display = 'none'; return; }
    box.style.display = 'flex';
    box.innerHTML = _state.isSuper ? ''
      : '<label class="wr-toggle"><input type="checkbox" id="wr-enabled" ' + (_state.enabled ? 'checked' : '') + ' onchange="wrToggle(this)"> Raport activ pe email</label>';
  }
  window.wrToggle = function (cb) {
    var enabled = !!cb.checked;
    fetch('/api/companies/me/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ weekly_report: { enabled: enabled } }) })
      .then(function (r) { return r.json(); })
      .then(function () { _state.enabled = enabled; say(enabled ? 'Raport săptămânal activat' : 'Raport săptămânal dezactivat'); })
      .catch(function () { cb.checked = !enabled; say('Nu am putut salva setarea', 'error'); });
  };

  // ─── Randare raport ───
  function fmtDate(s) { try { return new Date(s).toLocaleDateString('ro-RO'); } catch (e) { return String(s).slice(0, 10); } }
  // period_to = luni 00:00 (exclusiv) → ultima zi INCLUSĂ = period_to − 1 zi = duminică. Afișăm Luni–Duminică, nu Luni–Luni.
  function fmtDateEnd(s) { try { return new Date(new Date(s).getTime() - 86400000).toLocaleDateString('ro-RO'); } catch (e) { return String(s).slice(0, 10); } }
  function kpiCard(val, label, sub, color) {
    return '<div class="report-stat"' + (color ? ' style="border-color:' + color + ';"' : '') + '>' +
      '<div class="report-stat-value"' + (color ? ' style="color:' + color + ';"' : '') + '>' + val + '</div>' +
      '<div class="report-stat-label">' + label + (sub ? ' · ' + sub : '') + '</div></div>';
  }
  function aiHtml(text) {
    var out = [], lines = String(text || '').split('\n');
    var inList = false;
    lines.forEach(function (ln) {
      ln = ln.trim();
      if (!ln) { if (inList) { out.push('</ul>'); inList = false; } return; }
      if (/^(Pe scurt|Observații|Observatii|Recomandări|Recomandari|Concluzie)\s*:/.test(ln)) {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push('<div class="wr-ai-h">' + esc(ln.replace(/:$/, '')) + '</div>');
      } else if (/^[-•]\s+/.test(ln)) {
        if (!inList) { out.push('<ul class="wr-ai-ul">'); inList = true; }
        out.push('<li>' + esc(ln.replace(/^[-•]\s+/, '')) + '</li>');
      } else {
        if (inList) { out.push('</ul>'); inList = false; }
        out.push('<p>' + esc(ln) + '</p>');
      }
    });
    if (inList) out.push('</ul>');
    return out.join('');
  }

  function render(w) {
    var body = el('wr-body'); if (!body) return;
    var d = w.data || {}; var k = d.kpi || {}; var rk = d.rankings || {}; var s = d.series || {};
    var pj = el('wr-period'); if (pj) pj.textContent = fmtDate(w.period_from) + ' — ' + fmtDateEnd(w.period_to) + ' (Luni–Duminică)';

    var kpis = '<div class="wr-kpi">' +
      kpiCard(num(k.vehiclesActive) + ' / ' + num(k.vehiclesTotal), 'Vehicule active', '', 'var(--accent)') +
      kpiCard(num(k.totalKm) + ' km', 'Distanță totală', '', 'var(--accent)') +
      kpiCard(hm(k.totalMovingSec) || (num(k.totalMovingH) + ' h'), 'Ore în mers', num(k.totalTrips) + ' curse', '') +
      kpiCard(hm(k.totalStoppedSec) || (num(k.totalStoppedH) + ' h'), 'Ore staționate', '', '') +
      kpiCard(hm(k.totalIdleSec) || (num(k.totalIdleH) + ' h'), 'Ralanti', (k.idleCost ? num(k.idleCost) + ' RON' : ''), 'var(--orange)') +
      (k.totalFuel ? kpiCard(num(k.totalFuel) + ' L', 'Consum', num(k.fuelCost) + ' RON' + (k.vehiclesEstimated ? ' · parțial estimat' : ''), 'var(--orange)') : '') +
      (k.totalFuel ? kpiCard(num(k.avgPer100) + ' L/100km', 'Consum mediu', '', '') : '') +
      (k.co2Tons ? kpiCard(num(k.co2Tons) + ' t', 'CO₂', '', '') : '') +
      '</div>';

    var charts = '<div class="wr-charts">' +
      '<div class="chart-container h-250"><div class="chart-container-title">Distanță zilnică (km)</div><canvas id="wr-chart-km"></canvas></div>' +
      '<div class="chart-container h-250"><div class="chart-container-title">Stare flotă</div><canvas id="wr-chart-status"></canvas></div>' +
      '<div class="chart-container h-250"><div class="chart-container-title">Top vehicule după km</div><canvas id="wr-chart-topkm"></canvas></div>' +
      '<div class="chart-container h-250"><div class="chart-container-title">Top ralanti (ore)</div><canvas id="wr-chart-idle"></canvas></div>' +
      '</div>';

    var ai = '<div class="wr-ai"><div class="wr-ai-title"><i class="fas fa-robot"></i> Analiză automată</div><div class="wr-ai-body">' + aiHtml(w.ai_analysis) + '</div></div>';

    body.innerHTML = kpis + charts + ai + tableHtml(d.perVehicle || []);
    drawCharts(d);
  }

  function tableHtml(rows) {
    if (!rows.length) return '';
    var sorted = rows.slice().sort(function (a, b) { return b.km - a.km; });
    var h = '<div class="wr-table-title">Detaliu per vehicul</div><div style="overflow-x:auto;"><table class="wr-table"><thead><tr>' +
      ['Vehicul', 'Km', 'Ore mers', 'Ore staționat', 'Ralanti', 'Curse', 'Vmax', 'Consum', 'L/100km', 'Cost'].map(function (c) { return '<th>' + c + '</th>'; }).join('') +
      '</tr></thead><tbody>';
    sorted.forEach(function (v) {
      h += '<tr>' +
        '<td class="wr-veh">' + esc(v.name) + (v.plate ? ' <span class="wr-plate">' + esc(v.plate) + '</span>' : '') + '</td>' +
        '<td>' + num(v.km) + '</td>' +
        '<td>' + (hm(v.movingSec) || (num(v.movingH) + ' h')) + '</td>' +
        '<td>' + (hm(v.stoppedSec) || (num(v.stoppedH) + ' h')) + '</td>' +
        '<td>' + (hm(v.idleSec) || (num(v.idleH) + ' h')) + '</td>' +
        '<td>' + num(v.trips) + '</td>' +
        '<td>' + (v.maxSpeed ? num(v.maxSpeed) + ' km/h' : '—') + '</td>' +
        '<td>' + (v.liters ? num(v.liters) + ' L' + (v.estimated ? ' <span class="wr-est" title="Estimat din consumul configurat + km">est.</span>' : '') : '—') + '</td>' +
        '<td>' + (v.per100 != null ? v.per100 : '—') + '</td>' +
        '<td>' + (v.cost ? num(v.cost) + ' RON' : '—') + '</td>' +
        '</tr>';
    });
    return h + '</tbody></table></div>';
  }

  function drawCharts(d) {
    if (typeof window.createChart !== 'function') return;
    var s = d.series || {}, rk = d.rankings || {}, k = d.kpi || {};
    var GREEN = '#3FE07D', ORANGE = '#f59e0b', MUTED = '#94a3b8';
    // Distanță zilnică
    window.createChart('wr-chart-km', 'bar', { labels: s.labels || [], datasets: [{ label: 'km', data: s.km || [], backgroundColor: GREEN, minBarLength: 3 }] },
      { interaction: { mode: 'index', intersect: false }, plugins: { legend: { display: false } }, scales: { y: { beginAtZero: true } } });
    // Stare flotă (doughnut)
    var act = num(k.vehiclesActive), inact = num(k.vehiclesInactive);
    window.createChart('wr-chart-status', 'doughnut', { labels: ['Active', 'Inactive'], datasets: [{ data: [act, inact], backgroundColor: [GREEN, MUTED] }] },
      { plugins: { legend: { position: 'bottom' } } });
    // Top km (horizontal bar)
    var tk = (rk.topKm || []).slice(0, 7);
    window.createChart('wr-chart-topkm', 'bar', { labels: tk.map(function (v) { return v.name; }), datasets: [{ label: 'km', data: tk.map(function (v) { return v.km; }), backgroundColor: GREEN }] },
      { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } });
    // Top ralanti
    var ti = (rk.topIdle || []).filter(function (v) { return v.idleH > 0; }).slice(0, 7);
    if (ti.length) {
      window.createChart('wr-chart-idle', 'bar', { labels: ti.map(function (v) { return v.name; }), datasets: [{ label: 'ore', data: ti.map(function (v) { return v.idleH; }), backgroundColor: ORANGE }] },
        { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true } } });
    } else {
      var c = el('wr-chart-idle'); if (c && c.parentElement) c.parentElement.innerHTML = '<div class="chart-container-title">Top ralanti (ore)</div><div class="wr-empty" style="padding:30px;">Fără ralanti semnificativ în această perioadă.</div>';
    }
  }

  // ─── Controale admin ───
  function renderAdmin() {
    var box = el('wr-admin'); if (!box) return;
    if (!_state.canManage || (_state.isSuper && !_state.companyId)) { box.style.display = 'none'; return; }
    box.style.display = 'flex';
    box.innerHTML =
      // Toggle „Raport activ" e setare per-companie (via /companies/me) → doar pentru admin de companie, nu super.
      (_state.isSuper ? '' : '<label class="wr-toggle"><input type="checkbox" id="wr-enabled" ' + (_state.enabled ? 'checked' : '') + ' onchange="wrToggle(this)"> Raport activ</label>') +
      '';   // butonul de generare stă DOAR pe ecranul de pornire, nu se dublează aici
  }
  window.wrToggle = function (cb) {
    var enabled = !!cb.checked;
    fetch('/api/companies/me/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ weekly_report: { enabled: enabled } }) })
      .then(function (r) { return r.json(); })
      .then(function () { _state.enabled = enabled; say(enabled ? 'Raport săptămânal activat' : 'Raport săptămânal dezactivat'); })
      .catch(function () { cb.checked = !enabled; });
  };
})();
