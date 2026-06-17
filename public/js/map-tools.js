/* map-tools.js — bară de căutare + multi-select vehicule peste hartă + buton Suport clienți.
 * Self-contained. Accesează globalele aplicației (DEVS()/markers/map/selectDevice/showView). */
(function () {
  'use strict';
  function DEVS(){ return (window.getDevicesMap && window.getDevicesMap()) || null; }
  function MKS(){ return (window.getMarkersMap && window.getMarkersMap()) || null; }
  function MAP(){ return (window.getLeafletMap && window.getLeafletMap()) || null; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(id) { return document.getElementById(id); }

  function allImeis() { var a = []; try { DEVS().forEach(function (d, imei) { a.push(imei); }); } catch (e) {} return a; }
  function isSel(imei) { return !(window._mapSel instanceof Set) || window._mapSel.has(imei); }
  function selCount() { return (window._mapSel instanceof Set) ? window._mapSel.size : allImeis().length; }
  function updateCount() { var b = el('msb-count'); if (b) b.textContent = selCount() + ' / ' + allImeis().length; }

  // Aplică selecția pe toți markerii (afișează doar bifații).
  window.applyMapSelection = function () {
    if (!MAP() || !MKS()) return;
    MKS().forEach(function (mk, imei) {
      var show = isSel(imei);
      if (show) { if (!MAP().hasLayer(mk)) mk.addTo(MAP()); }
      else if (MAP().hasLayer(mk)) MAP().removeLayer(mk);
    });
    updateCount();
  };

  // ── Bara de căutare + multi-select ──
  function injectBar() {
    if (el('map-search-bar')) return;
    var bar = document.createElement('div'); bar.id = 'map-search-bar'; bar.className = 'msb';
    bar.innerHTML =
      '<div class="msb-search"><i class="fas fa-search"></i><input id="msb-input" placeholder="Caută vehicul, IMEI, nr…" autocomplete="off"></div>' +
      '<button class="msb-toggle" id="msb-toggle" title="Selectează vehicule pe hartă"><i class="fas fa-car-side"></i> <span id="msb-count">0 / 0</span> <i class="fas fa-chevron-down" style="font-size:10px"></i></button>' +
      '<div class="msb-dropdown" id="msb-dropdown" style="display:none;">' +
        '<div class="msb-dd-head"><a href="#" id="msb-all"><i class="fas fa-check-double"></i> Toate</a><a href="#" id="msb-none"><i class="fas fa-xmark"></i> Niciuna</a></div>' +
        '<div id="msb-list" class="msb-list"></div>' +
      '</div>';
    document.body.appendChild(bar);
    el('msb-input').addEventListener('input', renderList);
    el('msb-input').addEventListener('focus', openDropdown);
    el('msb-input').addEventListener('keydown', function (e) { if (e.key === 'Enter') { var f = (el('msb-list').querySelector('.msb-item-name')); if (f) f.click(); } });
    el('msb-toggle').addEventListener('click', function (e) { e.stopPropagation(); toggleDropdown(); });
    el('msb-all').addEventListener('click', function (e) { e.preventDefault(); window._mapSel = null; window.applyMapSelection(); renderList(); });
    el('msb-none').addEventListener('click', function (e) { e.preventDefault(); window._mapSel = new Set(); window.applyMapSelection(); renderList(); });
    document.addEventListener('click', function (e) { if (!bar.contains(e.target)) closeDropdown(); });
    updateCount();
  }
  function openDropdown() { el('msb-dropdown').style.display = 'block'; renderList(); }
  function closeDropdown() { var d = el('msb-dropdown'); if (d) d.style.display = 'none'; }
  function toggleDropdown() { var d = el('msb-dropdown'); if (d.style.display === 'none') openDropdown(); else closeDropdown(); }

  function renderList() {
    var box = el('msb-list'); if (!box) return;
    var q = ((el('msb-input') || {}).value || '').toLowerCase();
    var items = []; try { DEVS().forEach(function (d, imei) { items.push({ imei: imei, name: d.name || imei, plate: d.plate || '' }); }); } catch (e) {}
    items = items.filter(function (it) { return !q || (it.name + ' ' + it.plate + ' ' + it.imei).toLowerCase().indexOf(q) >= 0; });
    items.sort(function (a, b) { return (a.name || '').localeCompare(b.name || ''); });
    if (!items.length) { box.innerHTML = '<div class="msb-empty">Niciun vehicul găsit.</div>'; return; }
    box.innerHTML = items.slice(0, 300).map(function (it) {
      return '<label class="msb-item"><input type="checkbox" data-imei="' + esc(it.imei) + '" ' + (isSel(it.imei) ? 'checked' : '') + '>' +
        '<span class="msb-item-name" data-go="' + esc(it.imei) + '">' + esc(it.name) + (it.plate ? ' <span class="msb-plate">' + esc(it.plate) + '</span>' : '') + '</span></label>';
    }).join('') + (items.length > 300 ? '<div class="msb-empty">… primele 300. Filtrează pentru mai multe.</div>' : '');
    box.querySelectorAll('input[type=checkbox]').forEach(function (cb) {
      cb.addEventListener('change', function () {
        if (!(window._mapSel instanceof Set)) window._mapSel = new Set(allImeis()); // materializează din „toate"
        if (cb.checked) window._mapSel.add(cb.dataset.imei); else window._mapSel.delete(cb.dataset.imei);
        window.applyMapSelection();
      });
    });
    box.querySelectorAll('.msb-item-name').forEach(function (sp) {
      sp.addEventListener('click', function (e) { e.preventDefault(); closeDropdown(); if (typeof window.selectDevice === 'function') window.selectDevice(sp.dataset.go); });
    });
  }

  // ── Suport clienți ──
  function injectSupport() {
    if (el('support-overlay')) return;
    var o = document.createElement('div'); o.id = 'support-overlay'; o.className = 'msb-overlay';
    o.innerHTML = '<div class="msb-card"><div class="msb-card-head"><b><i class="fas fa-headset"></i> Suport clienți</b><button onclick="closeSupport()" class="msb-x">&times;</button></div>' +
      '<div class="msb-card-body">' +
        '<div class="msb-contact">' +
          '<a href="tel:+40312295000"><i class="fas fa-phone"></i> 0312 295 000</a>' +
          '<a href="mailto:suport@ratrack.ro"><i class="fas fa-envelope"></i> suport@ratrack.ro</a>' +
          '<a href="https://wa.me/40700000000" target="_blank" rel="noopener"><i class="fab fa-whatsapp"></i> WhatsApp</a>' +
        '</div>' +
        '<div class="msb-muted">Program: Luni–Vineri, 09:00–18:00. Sau trimite-ne un mesaj direct:</div>' +
        '<textarea id="support-msg" rows="4" placeholder="Descrie problema sau întrebarea ta…"></textarea>' +
        '<button class="msb-send" onclick="sendSupport()"><i class="fas fa-paper-plane"></i> Trimite mesajul</button>' +
        '<div id="support-status" class="msb-muted" style="margin-top:8px;"></div>' +
      '</div></div>';
    o.addEventListener('click', function (e) { if (e.target === o) window.closeSupport(); });
    document.body.appendChild(o);
  }
  window.openSupport = function () { injectSupport(); el('support-overlay').classList.add('open'); setTimeout(function () { var t = el('support-msg'); if (t) t.focus(); }, 60); };
  window.closeSupport = function () { var o = el('support-overlay'); if (o) o.classList.remove('open'); };
  window.sendSupport = function () {
    var t = el('support-msg'), st = el('support-status'); var msg = (t.value || '').trim();
    if (!msg) { st.textContent = 'Scrie un mesaj înainte de a trimite.'; return; }
    st.textContent = 'Se trimite…';
    fetch('/api/support', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ message: msg }) })
      .then(function (r) { return r.json(); })
      .then(function (j) {
        if (j && j.ok) { st.innerHTML = '<span style="color:var(--accent)">✓ Mesaj trimis. Te contactăm în curând.</span>'; t.value = ''; }
        else st.textContent = 'Eroare: ' + ((j && j.error) || 'necunoscută');
      }).catch(function () { st.textContent = 'Eroare de rețea.'; });
  };

  // ── Vizibilitate bară: doar pe harta „Localizare", după autentificare ──
  // Citește starea din DOM (#view-localizare.active) → robust indiferent cum se apelează showView.
  function updateBarVisibility() {
    var bar = el('map-search-bar'); if (!bar) return;
    var app = el('app'); var appVisible = app && app.classList.contains('visible');
    var loc = el('view-localizare'); var onMap = loc && loc.classList.contains('active');
    bar.style.display = (appVisible && onMap) ? 'flex' : 'none';
  }
  window._msbUpdateVisibility = updateBarVisibility;

  function init() {
    injectBar();
    setInterval(updateCount, 4000);
    if (typeof window.showView === 'function' && !window._msbHooked) {
      window._msbHooked = true;
      var orig = window.showView;
      window.showView = function (n) { orig(n); updateBarVisibility(n); };
    }
    // re-evaluează vizibilitatea după login (când #app devine vizibil)
    setInterval(function () { updateBarVisibility(); }, 1500);
    updateBarVisibility();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
