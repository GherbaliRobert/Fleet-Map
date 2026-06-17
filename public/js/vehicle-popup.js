/* vehicle-popup.js — balon (popup Leaflet) la click pe vehicul (desktop), în stil AROBS.
 * Butoane: Detalii (deschide panoul din dreapta) · Urmărește (follow live) · Localizare (Google Maps/Waze).
 * Self-contained; folosește accesorii window.getLeafletMap/getMarkersMap/getDevicesMap
 * + globalele window.selectDevice / window.openDetailPanel / window.reverseGeocode / window.isDeviceOnline. */
(function () {
  'use strict';
  function MAP() { return (window.getLeafletMap && window.getLeafletMap()) || null; }
  function MKS() { return (window.getMarkersMap && window.getMarkersMap()) || null; }
  function DEVS() { return (window.getDevicesMap && window.getDevicesMap()) || null; }
  function el(id) { return document.getElementById(id); }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function online(d) { try { return window.isDeviceOnline ? window.isDeviceOnline(d) : true; } catch (e) { return true; } }

  var fullCache = {}; // imei -> /full (brand, model, driver_name, vehicle_type)

  function row(k, vHtml, id) { return '<tr><td>' + esc(k) + '</td><td' + (id ? (' id="' + id + '"') : '') + '>' + vHtml + '</td></tr>'; }

  // Câmpuri dinamice (se schimbă la fiecare update live): status, dot, viteză, coordonate, oră.
  function liveBits(d) {
    var speed = (d.speed != null ? d.speed : 0);
    var moving = speed > 0;
    var on = online(d);
    return {
      speed: speed, moving: moving,
      dot: !on ? 'var(--text-muted)' : (moving ? 'var(--green)' : ((d.io && d.io.ignition) ? 'var(--yellow)' : 'var(--red)')),
      status: !on ? 'Offline' : (moving ? 'În mișcare' : ((d.io && d.io.ignition) ? 'Staționat (contact pornit)' : 'Oprit')),
      lat: (d.latitude != null ? (+d.latitude).toFixed(5) : '—'),
      lng: (d.longitude != null ? (+d.longitude).toFixed(5) : '—'),
      ang: (d.angle != null ? Math.round(d.angle) + '°' : '—'),
      ts: (d.timestamp ? new Date(d.timestamp).toLocaleString('ro-RO') : '—')
    };
  }

  function buildHtml(imei) {
    var d = DEVS() && DEVS().get(imei); if (!d) return '';
    var f = fullCache[imei] || {};
    var b = liveBits(d);
    var name = d.name || imei;
    var plate = d.plate || '';
    var ll = (d.latitude != null && d.longitude != null) ? (d.latitude + ',' + d.longitude) : '';
    var veh = [f.brand, f.model].filter(Boolean).join(' ') || d.vehicle_type || '—';
    var driver = f.driver_name || '';

    var rows = '';
    if (plate) rows += row('Nr. înmatriculare', '<b style="color:var(--accent)">' + esc(plate) + '</b>');
    rows += row('Vehicul', esc(veh), 'vp-veh-' + imei);
    rows += row('Șofer', driver ? esc(driver) : '<span style="color:var(--text-muted)">…</span>', 'vp-drv-' + imei);
    rows += row('Adresă', '<span style="color:var(--text-muted)">se încarcă…</span>', 'vp-adr-' + imei);
    rows += row('Viteză', '<span id="vp-spd-' + imei + '" style="color:' + (b.moving ? 'var(--green)' : 'var(--text-muted)') + '">' + b.speed + ' km/h</span>');
    rows += row('Coordonate', esc(b.lat + ', ' + b.lng + '  ·  ' + b.ang), 'vp-coord-' + imei);

    return '' +
      '<div class="vp-card">' +
        '<div class="vp-head">' +
          '<span class="vp-dot" id="vp-dot-' + imei + '" style="background:' + b.dot + ';box-shadow:0 0 7px ' + b.dot + '"></span>' +
          '<div class="vp-head-txt"><div class="vp-name">' + esc(name) + '</div><div class="vp-status" id="vp-status-' + imei + '">' + esc(b.status) + '</div></div>' +
        '</div>' +
        '<table class="vp-table">' + rows + '</table>' +
        '<div class="vp-time" id="vp-time-' + imei + '"><i class="far fa-clock"></i> ' + esc(b.ts) + '</div>' +
        '<div class="vp-actions">' +
          '<button class="vp-btn vp-primary" onclick="vpDetails(\'' + esc(imei) + '\')"><i class="fas fa-circle-info"></i> Detalii</button>' +
          '<button class="vp-btn vp-follow" onclick="vpFollow(\'' + esc(imei) + '\')"><i class="fas fa-crosshairs"></i> Urmărește</button>' +
          '<button class="vp-btn vp-nav" onclick="vpNav(event,\'' + esc(imei) + '\')"><i class="fas fa-diamond-turn-right"></i> Localizare</button>' +
        '</div>' +
        '<div class="vp-navmenu" id="vp-navmenu-' + esc(imei) + '">' +
          (ll
            ? '<a href="https://www.google.com/maps/dir/?api=1&destination=' + ll + '" target="_blank" rel="noopener"><i class="fas fa-map-location-dot"></i> Google Maps</a>' +
              '<a href="https://waze.com/ul?ll=' + ll + '&navigate=yes" target="_blank" rel="noopener"><i class="fas fa-location-arrow"></i> Waze</a>'
            : '<span style="color:var(--text-muted);padding:6px 8px">Poziție indisponibilă</span>') +
        '</div>' +
      '</div>';
  }

  // Deschide balonul pe markerul vehiculului.
  window.openVehiclePopup = function (imei) {
    var map = MAP(), mks = MKS();
    if (!map || !mks) { if (window.selectDevice) window.selectDevice(imei); return; }
    ensureHooks();
    var mk = mks.get(imei); if (!mk) return;
    if (!mk.getPopup()) mk.bindPopup('', { maxWidth: 330, minWidth: 290, className: 'vp-popup', autoPanPadding: [40, 80], closeButton: true });
    mk.setPopupContent(buildHtml(imei));
    mk.openPopup();
    enrich(imei);
  };

  // Îmbogățește async: adresă (reverse-geocode) + marcă/model/șofer (/full), apoi update în DOM.
  function enrich(imei) {
    var d = DEVS() && DEVS().get(imei); if (!d) return;
    if (window.reverseGeocode && d.latitude != null) {
      window.reverseGeocode(d.latitude, d.longitude).then(function (addr) {
        var a = el('vp-adr-' + imei); if (a) { a.textContent = addr; a.style.color = 'var(--text-primary)'; }
      }).catch(function () {});
    }
    if (fullCache[imei]) { applyFull(imei); return; }
    fetch('/api/devices/' + encodeURIComponent(imei) + '/full', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (f) { if (f && !f.error) { fullCache[imei] = f; applyFull(imei); } })
      .catch(function () {});
  }
  function applyFull(imei) {
    var f = fullCache[imei]; if (!f) return;
    var veh = [f.brand, f.model].filter(Boolean).join(' ') || f.vehicle_type || '—';
    var vc = el('vp-veh-' + imei); if (vc) vc.textContent = veh;
    var dc = el('vp-drv-' + imei); if (dc) { dc.textContent = f.driver_name || 'Nealocat'; dc.style.color = f.driver_name ? 'var(--text-primary)' : 'var(--text-muted)'; }
  }

  // Update DOAR câmpurile live (fără rebuild → fără flicker pe adresă/șofer, fără a închide meniul nav).
  function updateLiveFields(imei) {
    var d = DEVS() && DEVS().get(imei); if (!d) return;
    var b = liveBits(d);
    var dot = el('vp-dot-' + imei); if (dot) { dot.style.background = b.dot; dot.style.boxShadow = '0 0 7px ' + b.dot; }
    var st = el('vp-status-' + imei); if (st) st.textContent = b.status;
    var sp = el('vp-spd-' + imei); if (sp) { sp.textContent = b.speed + ' km/h'; sp.style.color = b.moving ? 'var(--green)' : 'var(--text-muted)'; }
    var co = el('vp-coord-' + imei); if (co) co.textContent = b.lat + ', ' + b.lng + '  ·  ' + b.ang;
    var tm = el('vp-time-' + imei); if (tm) tm.innerHTML = '<i class="far fa-clock"></i> ' + esc(b.ts);
  }

  // Refresh dacă balonul vehiculului e deschis (date live). Apelat din updateMarker.
  window.vpRefreshIfOpen = function (imei) {
    try {
      var mks = MKS(); if (!mks) return;
      var mk = mks.get(imei); if (!mk || !mk.isPopupOpen || !mk.isPopupOpen()) return;
      updateLiveFields(imei);
    } catch (e) {}
  };

  // ── Butoane ──
  // Detalii: deschide panoul din dreapta (fără follow). E o „altă comandă" → oprește orice follow activ.
  window.vpDetails = function (imei) {
    if (window.vpClearFollow) window.vpClearFollow();
    var map = MAP(); if (map) map.closePopup();
    if (window.selectDevice) window.selectDevice(imei);
    else if (window.openDetailPanel) window.openDetailPanel(imei, 'info');
  };
  // Urmărește: follow live — panoul se deschide, balonul dispare, harta ține mașina centrată până la altă comandă.
  window.vpFollow = function (imei) {
    window.vpSetFollow(imei);
    var map = MAP(); if (map) map.closePopup();
    if (window.selectDevice) window.selectDevice(imei);
    var d = DEVS() && DEVS().get(imei);
    if (map && d && d.latitude != null) { try { map.panTo([d.latitude, d.longitude]); } catch (e) {} }
  };
  // Localizare: deschide meniul Google Maps / Waze.
  window.vpNav = function (ev, imei) {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    var m = el('vp-navmenu-' + imei); if (m) m.classList.toggle('show');
  };

  // ── Stare follow (deținută aici; inline-ul doar citește window._followImei și apelează vpClearFollow) ──
  if (typeof window._followImei === 'undefined') window._followImei = null;
  window.vpSetFollow = function (imei) {
    window._followImei = imei;
    var d = DEVS() && DEVS().get(imei);
    renderBadge((d && (d.name || imei)) || imei);
  };
  window.vpClearFollow = function () {
    window._followImei = null;
    var b = el('vp-follow-badge'); if (b) b.parentNode && b.parentNode.removeChild(b);
  };
  function renderBadge(name) {
    var b = el('vp-follow-badge');
    if (!b) { b = document.createElement('div'); b.id = 'vp-follow-badge'; b.className = 'vp-follow-badge'; document.body.appendChild(b); }
    b.innerHTML = '<i class="fas fa-crosshairs"></i> <span>Urmărești: <b>' + esc(name) + '</b></span> <button title="Oprește urmărirea" onclick="vpClearFollow()">&times;</button>';
  }

  // La control manual al hărții (drag) → oprește follow-ul.
  function ensureHooks() {
    var map = MAP(); if (!map || map.__vpHooked) return; map.__vpHooked = true;
    map.on('dragstart', function () { if (window._followImei) window.vpClearFollow(); });
  }

  // Închide meniul nav (Google/Waze) la click în afara lui.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('.vp-nav')) return; // butonul Localizare își face singur toggle
    document.querySelectorAll('.vp-navmenu.show').forEach(function (m) { if (!m.contains(t)) m.classList.remove('show'); });
  });
})();
