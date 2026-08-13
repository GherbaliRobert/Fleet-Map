/* weekly-report-ui.js — Raport săptămânal de activitate flotă (pagină în aplicație).
 * KPI + grafice (Chart.js via createChart) + analiză AI + tabel per vehicul + arhivă săptămâni + controale admin.
 * Self-contained; populează containerul #weekly-report-view. */
(function () {
  'use strict';
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function num(n, d) { return (n == null || isNaN(n)) ? (d || 0) : n; }
  // Secunde → „Xh Ym" (ore+minute, nu zecimal). null dacă nu avem secunde (rapoarte vechi) → apelantul cade pe orele zecimale.
  function hm(sec) { if (sec == null || isNaN(sec)) return null; sec = Math.round(sec); var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60); return h > 0 ? (m > 0 ? h + 'h ' + m + 'm' : h + 'h') : m + 'm'; }

  var _state = { canManage: false, enabled: true, recipients: [], current: null };

  function ensureSkeleton() {
    var host = el('weekly-report-view'); if (!host) return null;
    if (el('wr-body')) return host;
    host.innerHTML =
      '<div class="modal" style="width:1180px;max-width:97vw;max-height:94vh;display:flex;flex-direction:column;">' +
        '<h2 style="flex:0 0 auto;"><span><i class="fas fa-chart-line" style="margin-right:8px;color:var(--accent);"></i> Raport săptămânal flotă</span>' +
          '<button class="close-btn" onclick="showView(\'localizare\')" style="position:static;font-size:18px;">&#10005;</button></h2>' +
        '<div class="wr-toolbar">' +
          '<select id="wr-company" class="rax-field" style="width:auto;min-width:190px;margin:0;display:none;" onchange="wrSetCompany(this.value)"></select>' +
          '<span id="wr-period" class="wr-period"></span>' +
          '<span style="flex:1"></span>' +
          '<span id="wr-admin" class="wr-admin" style="display:none;"></span>' +
        '</div>' +
        // Ecranul de pornire: ISTORICUL primul, generarea dedesubt. Raportul se deschide peste el.
        '<div id="wr-home" style="overflow:auto;flex:1;min-height:0;padding-right:4px;"></div>' +
        '<div id="wr-body" style="overflow:auto;flex:1;min-height:0;padding-right:4px;display:none;">' +
          '<div class="wr-loading">Se încarcă…</div>' +
        '</div>' +
      '</div>';
    return host;
  }

  // ─── Încărcare ───
  window.openWeeklyReport = function () {
    var host = ensureSkeleton(); if (!host) return;
    // Pornim pe ISTORIC (nu direct pe ultimul raport): întâi vezi ce ai, apoi ceri altceva.
    loadLatest(_state.companyId || null);
  };
  function loadLatest(companyId) {
    var body = el('wr-body'); if (body) body.innerHTML = '<div class="wr-loading">Se încarcă…</div>';
    var qs = companyId ? ('?companyId=' + encodeURIComponent(companyId)) : '';
    fetch('/api/weekly-report/latest' + qs, { credentials: 'same-origin' })
      .then(function (r) { if (r.status === 403) throw new Error('forbidden'); return r.json(); })
      .then(function (d) {
        _state.canManage = !!d.canManage; _state.enabled = (d.enabled !== false); _state.recipients = d.recipients || [];
        _state.isSuper = !!d.isSuper; _state.companyId = d.companyId || companyId || null;
        ensureCompanyPicker();
        renderAdmin();
        if (_state.isSuper && !_state.companyId) { // super-admin: trebuie să aleagă o companie întâi
          _state.needsCompany = true;
          var hh = el('wr-home'), bb = el('wr-body');
          if (hh) hh.style.display = ''; if (bb) bb.style.display = 'none';
          renderPickCompany(); return;
        }
        _state.needsCompany = false;
        // Ecranul de start = ISTORICUL, nu ultimul raport. Raportul se deschide de acolo.
        window.wrShowHome();
      })
      .catch(function (e) {
        var body = el('wr-body');
        if (body) body.innerHTML = '<div class="wr-empty">' + (e.message === 'forbidden' ? 'Raportul de flotă e disponibil doar pentru administratori și manageri.' : 'Eroare la încărcare.') + '</div>';
      });
  }
  // Selector companie — DOAR super-admin (raportul e per-companie; super n-are companie proprie). Lista se ia o dată.
  function ensureCompanyPicker() {
    var sel = el('wr-company'); if (!sel) return;
    if (!_state.isSuper) { sel.style.display = 'none'; return; }
    sel.style.display = '';
    if (_state.companies) { sel.value = _state.companyId || ''; return; }
    fetch('/api/companies', { credentials: 'same-origin' }).then(function (r) { return r.json(); }).then(function (list) {
      _state.companies = Array.isArray(list) ? list : [];
      sel.innerHTML = '<option value="">— alege compania —</option>' + _state.companies.map(function (c) { return '<option value="' + c.id + '">' + esc(c.name) + '</option>'; }).join('');
      sel.value = _state.companyId || '';
    }).catch(function () {});
  }
  window.wrSetCompany = function (v) { _state.companyId = v ? parseInt(v) : null; loadLatest(_state.companyId); };
  function renderPickCompany() {
    var body = el('wr-home') || el('wr-body'); if (!body) return;   // ecranul de start, nu zona raportului
    body.innerHTML = '<div class="wr-empty"><i class="fas fa-building" style="font-size:34px;color:var(--text-muted);margin-bottom:10px;"></i>' +
      '<div>Alege o companie din selectorul de sus pentru a vedea sau genera raportul săptămânal.</div></div>';
    var p = el('wr-period'); if (p) p.textContent = '';
  }

  // loadArchive()/wrLoadSelected() scoase: dropdown-ul „wr-archive" a fost înlocuit de lista de istoric


  function renderEmpty() {
    var body = el('wr-body'); if (!body) return;
    body.innerHTML = '<div class="wr-empty"><i class="fas fa-chart-line" style="font-size:34px;color:var(--text-muted);margin-bottom:10px;"></i>' +
      '<div>Niciun raport generat încă.</div>' +
      '<div style="color:var(--text-muted);font-size:13px;margin-top:6px;">Raportul se generează automat în fiecare luni pentru săptămâna încheiată.' +
      (_state.canManage ? ' Sau generează-l acum:' : '') + '</div>' +
      '<button class="btn-primary" style="margin-top:14px;max-width:260px;" onclick="wrShowHome()"><i class="fas fa-arrow-left"></i> Înapoi la istoric</button>' +
      '</div>';
    el('wr-period') && (el('wr-period').textContent = '');
  }

  // ─── Ecran de pornire: istoric + alegerea săptămânii ───
  // Săptămâna raportului e Luni→Luni (UTC), exact ca pe server (weekly_report.lastCompletedWeek).
  function mondayUTC(d) {
    var day = d.getUTCDay(), off = (day === 0 ? 6 : day - 1);
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - off));
  }
  // Ultimele N săptămâni ÎNCHEIATE, cea mai recentă prima.
  function lastWeeks(n) {
    var thisMon = mondayUTC(new Date()), out = [];
    for (var i = 1; i <= n; i++) {
      var from = new Date(thisMon.getTime() - i * 7 * 864e5);
      out.push({ from: from.toISOString(), to: new Date(from.getTime() + 7 * 864e5).toISOString() });
    }
    return out;
  }
  function weekLabel(w) {
    var a = new Date(w.from), b = new Date(new Date(w.to).getTime() - 864e5); // ultima zi INCLUSĂ
    var mo = ['ian','feb','mar','apr','mai','iun','iul','aug','sep','oct','noi','dec'];
    var sameMonth = a.getUTCMonth() === b.getUTCMonth();
    return a.getUTCDate() + (sameMonth ? '' : ' ' + mo[a.getUTCMonth()]) + ' – ' + b.getUTCDate() + ' ' + mo[b.getUTCMonth()] + ' ' + b.getUTCFullYear();
  }
  function dayKeyOf(iso) { return String(iso).slice(0, 10); }

  window.wrShowHome = function () {
    var home = el('wr-home'), body = el('wr-body');
    if (home) home.style.display = ''; if (body) body.style.display = 'none';
    var per = el('wr-period'); if (per) per.textContent = '';
    loadHome();
  };
  function loadHome() {
    var home = el('wr-home'); if (!home) return;
    if (_state.companyId == null && _state.needsCompany) { renderPickCompany(); return; }
    home.innerHTML = '<div class="wr-loading">Se încarcă…</div>';
    var qs = '?limit=26' + (_state.companyId ? '&companyId=' + encodeURIComponent(_state.companyId) : '');
    fetch('/api/weekly-reports' + qs, { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (list) { renderHome(Array.isArray(list) ? list : []); })
      .catch(function () { renderHome([]); });
  }
  function renderHome(list) {
    var home = el('wr-home'); if (!home) return;
    _state.history = list;
    var done = {};                     // săptămânile deja generate, după ziua de început
    list.forEach(function (w) { done[dayKeyOf(w.period_from)] = w.id; });

    var rows = list.map(function (w, i) {
      var d = w.data || {}, k = d.kpi || {};
      var km = k.totalKm != null ? num(Math.round(k.totalKm)) + ' km' : '—';
      var veh = k.vehiclesActive != null ? k.vehiclesActive + ' vehicule active' : '';
      return '<button type="button" class="wr-hrow" onclick="wrOpenReport(' + w.id + ')">' +
        '<span class="wr-hdot"' + (i === 0 ? ' data-last="1"' : '') + '></span>' +
        '<span class="wr-hper">' + esc(weekLabel({ from: w.period_from, to: w.period_to })) + '</span>' +
        '<span class="wr-hkpi">' + esc(km) + (veh ? ' · ' + esc(veh) : '') + '</span>' +
        '<span class="wr-hgo">Deschide <i class="fas fa-chevron-right"></i></span>' +
      '</button>';
    }).join('');

    var opts = lastWeeks(12).map(function (w) {
      var gen = done[dayKeyOf(w.from)];
      return '<option value="' + esc(w.from) + '|' + esc(w.to) + '"' + (gen ? ' data-gen="' + gen + '"' : '') + '>' +
        esc(weekLabel(w)) + (gen ? '  ✓ generat' : '') + '</option>';
    }).join('');

    home.innerHTML =
      '<div class="wr-sec-t">Istoric rapoarte' + (list.length ? ' <span class="wr-cnt">' + list.length + '</span>' : '') + '</div>' +
      (rows ? '<div class="wr-hlist">' + rows + '</div>'
            : '<div class="wr-empty" style="padding:26px 10px;"><i class="fas fa-chart-line" style="font-size:30px;color:var(--text-muted);margin-bottom:8px;"></i>' +
              '<div>Niciun raport generat încă.</div>' +
              '<div style="color:var(--text-muted);font-size:13px;margin-top:6px;">Se generează automat în fiecare luni, pentru săptămâna încheiată. Sau alege una mai jos.</div></div>') +
      (_state.canManage
        ? '<div class="wr-gen">' +
            '<div class="wr-sec-t" style="margin-top:0;">Generează o săptămână</div>' +
            '<div class="wr-genrow">' +
              '<select id="wr-week" class="rax-field" style="margin:0;min-width:220px;width:auto;">' + opts + '</select>' +
              '<button class="btn-primary wr-genbtn" onclick="wrGenerate(this)"><i class="fas fa-bolt"></i> Generează</button>' +
            '</div>' +
            '<div class="wr-genhint">Săptămânile bifate au deja raport — se deschide cel existent, fără să-l refacem.</div>' +
          '</div>'
        : '');
  }
  window.wrOpenReport = function (id) {
    var home = el('wr-home'), body = el('wr-body');
    if (home) home.style.display = 'none';
    if (body) { body.style.display = ''; body.innerHTML = '<div class="wr-loading">Se încarcă…</div>'; }
    fetch('/api/weekly-report/' + parseInt(id), { credentials: 'same-origin' }).then(function (r) { return r.json(); })
      .then(function (w) { if (w && w.data) { _state.current = w; render(w); } else renderEmpty(); })
      .catch(function () { renderEmpty(); });
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

    var back = '<button type="button" class="wr-back" onclick="wrShowHome()"><i class="fas fa-arrow-left"></i> Înapoi la istoric</button>';

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

    body.innerHTML = back + kpis + charts + ai + tableHtml(d.perVehicle || []);
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
      '<button class="btn-sm" onclick="wrGenerate(this)" title="Generează raportul pentru ultima săptămână completă"><i class="fas fa-bolt"></i> Generează acum</button>';
  }
  window.wrToggle = function (cb) {
    var enabled = !!cb.checked;
    fetch('/api/companies/me/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ weekly_report: { enabled: enabled } }) })
      .then(function (r) { return r.json(); })
      .then(function () { _state.enabled = enabled; if (window.toast) window.toast(enabled ? 'Raport săptămânal activat' : 'Raport săptămânal dezactivat'); })
      .catch(function () { cb.checked = !enabled; });
  };
  window.wrGenerate = function (btn) {
    var sel = el('wr-week');
    var opt = sel && sel.options[sel.selectedIndex];
    // Săptămâna are deja raport → îl deschidem pe cel existent. Regenerarea ar consuma AI degeaba.
    var already = opt && opt.getAttribute('data-gen');
    if (already) { window.wrOpenReport(parseInt(already)); return; }
    var payload = {};
    if (_state.companyId) payload.companyId = _state.companyId;
    if (sel && sel.value && sel.value.indexOf('|') > 0) {
      var parts = sel.value.split('|'); payload.from = parts[0]; payload.to = parts[1];
    }
    if (btn) { btn.disabled = true; btn.dataset._t = btn.innerHTML; btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Se generează…'; }
    fetch('/api/weekly-report/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset._t || 'Generează'; }
        if (j && j.report) {
          _state.current = j.report;
          var home = el('wr-home'), body = el('wr-body');
          if (home) home.style.display = 'none'; if (body) body.style.display = '';
          render(j.report);
          if (window.toast) window.toast('Raport generat');
        } else if (window.toast) window.toast((j && j.error) || 'Eroare la generare', true);
      })
      .catch(function () { if (btn) { btn.disabled = false; btn.innerHTML = btn.dataset._t || 'Generează'; } });
  };
;
})();
