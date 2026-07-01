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
    var on = online(d);
    // „În mișcare" (verde) DOAR dacă a transmis recent (<3 min). Viteză>0 dintr-un pachet vechi (semnal pierdut
    // în mers) → galben „⚠️ Fără semnal recent", nu verde fals. Aliniat cu markerul / lista / fișa.
    var fresh = d.timestamp ? (Date.now() - new Date(d.timestamp).getTime()) < 180000 : false;
    var fastEnough = speed > 3;
    var liveMoving = fastEnough && fresh;
    var ign = !!(d.io && (d.io.ignition === 1 || d.io.ignition === true));
    var dot, status;
    if (!on) { dot = 'var(--text-muted)'; status = '⚠️ Oprit (fără semnal)'; }
    else if (liveMoving) { dot = 'var(--green)'; status = 'În mișcare'; }
    else if (fastEnough) { dot = 'var(--yellow)'; status = '⚠️ Fără semnal recent'; }
    else if (ign) { dot = 'var(--yellow)'; status = 'Staționat (contact pornit)'; }
    else { dot = 'var(--red)'; status = 'Oprit'; }
    return {
      speed: speed, moving: liveMoving,
      dot: dot, status: status,
      lat: (d.latitude != null ? (+d.latitude).toFixed(5) : '—'),
      lng: (d.longitude != null ? (+d.longitude).toFixed(5) : '—'),
      ang: (d.angle != null ? Math.round(d.angle) + '°' : '—'),
      ts: (d.timestamp ? new Date(d.timestamp).toLocaleString('ro-RO') : '—')
    };
  }

  // ── Durate „de când" (folosesc momentele de referință din /full: last_moved_at, ignition_on_at) ──
  function fmtDur(ms) {
    if (ms == null || isNaN(ms) || ms < 0) return '—';
    var m = Math.floor(ms / 60000), h = Math.floor(m / 60), zile = Math.floor(h / 24);
    if (zile >= 1) return zile + 'z ' + (h % 24) + 'h';
    if (h >= 1) return h + 'h ' + (m % 60) + 'm';
    if (m >= 1) return m + 'm';
    return 'sub 1m';
  }
  // Referință pentru durate: ULTIMA TRANSMISIE a vehiculului, nu „acum". Altfel, pentru un vehicul
  // offline, „motor pornit de" / „în staționare de" ar crește la nesfârșit deși nu mai dă semnal.
  // Plafonat la „acum" (în caz de ceas defazat al device-ului).
  function refMs(d) {
    var t = (d && d.timestamp) ? new Date(d.timestamp).getTime() : NaN;
    return isNaN(t) ? Date.now() : Math.min(t, Date.now());
  }
  function durStat(d, f) {
    // „în mișcare" DOAR dacă transmite live (<3 min, viteză>3). Altfel arătăm de când stă (last_moved_at) —
    // un pachet vechi cu viteză>0 (semnal pierdut) nu mai înseamnă „în mișcare". Aliniat cu liveBits.
    var fresh = d && d.timestamp ? (Date.now() - new Date(d.timestamp).getTime()) < 180000 : false;
    if (d && d.speed > 3 && fresh) return '<span style="color:var(--green)">în mișcare</span>';
    if (!f) return '<span style="color:var(--text-muted)">…</span>';
    if (!f.last_moved_at) return 'fără date';
    return fmtDur(refMs(d) - new Date(f.last_moved_at).getTime());
  }
  function engOn(d) { return !!(d && d.io && (d.io.ignition === 1 || d.io.ignition === true)); }
  function engLabel(d) { return engOn(d) ? 'Motor pornit de' : 'Motor oprit de'; }
  function durEng(d, f) {
    if (!f) return '<span style="color:var(--text-muted)">…</span>';
    // pornit de = de la ultima oprire (ignition_off_at) · oprit de = de la ultima pornire (ignition_on_at)
    var anchor = engOn(d) ? f.ignition_off_at : f.ignition_on_at;
    if (!anchor) return 'fără date';
    return fmtDur(refMs(d) - new Date(anchor).getTime());
  }
  function renderDur(imei) {
    var d = DEVS() && DEVS().get(imei); if (!d) return;
    var f = fullCache[imei] || null;
    var s = el('vp-stat-' + imei); if (s) s.innerHTML = durStat(d, f);
    var sr = el('vp-statrow-' + imei); if (sr) sr.style.display = engOn(d) ? '' : 'none'; // ascunde „În staționare de" cu motorul oprit (redundant cu „Motor oprit de")
    var lbl = el('vp-englbl-' + imei); if (lbl) lbl.textContent = engLabel(d);
    var e = el('vp-eng-' + imei); if (e) e.innerHTML = durEng(d, f);
  }

  // Limita de viteză recunoscută de camera mașinii (IO 1116 → speed_limit_sign). 0 = absent/necredibil → nu afișăm.
  function spdLimitOf(d) {
    var io = (d && d.io) || {};
    var v = (io.speed_limit_sign != null) ? io.speed_limit_sign : io.io_1116;
    v = Number(v);
    return (isFinite(v) && v >= 5 && v <= 200) ? Math.round(v) : 0;
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
    var _splim0 = spdLimitOf(d);
    rows += row('Viteză', '<span id="vp-spd-' + imei + '" style="color:' + (b.moving ? 'var(--green)' : 'var(--text-muted)') + '">' + b.speed + ' km/h</span>' +
      '<span class="vp-splimit" id="vp-splim-' + imei + '"' + (_splim0 ? '' : ' style="display:none"') + ' title="Limită de viteză (recunoscută de cameră)">' + (_splim0 || '') + '</span>');
    // „În staționare de" doar cu motorul PORNIT (staționat/idling). Cu motorul oprit e redundant cu „Motor oprit de" → ascuns.
    rows += '<tr id="vp-statrow-' + imei + '"' + (engOn(d) ? '' : ' style="display:none"') + '><td>În staționare de</td><td id="vp-stat-' + imei + '">' + durStat(d, fullCache[imei] || null) + '</td></tr>';
    rows += '<tr><td id="vp-englbl-' + imei + '">' + esc(engLabel(d)) + '</td><td id="vp-eng-' + imei + '">' + durEng(d, fullCache[imei] || null) + '</td></tr>';
    rows += row('Coordonate', esc(b.lat + ', ' + b.lng + '  ·  ' + b.ang), 'vp-coord-' + imei);
    rows += row('Data ultimei transmisii', esc(b.ts), 'vp-tx-' + imei);

    return '' +
      '<div class="vp-card">' +
        '<div class="vp-head">' +
          '<span class="vp-dot" id="vp-dot-' + imei + '" style="background:' + b.dot + ';box-shadow:0 0 7px ' + b.dot + '"></span>' +
          '<div class="vp-head-txt"><div class="vp-name">' + esc(name) + '</div><div class="vp-status" id="vp-status-' + imei + '">' + esc(b.status) + '</div></div>' +
        '</div>' +
        '<table class="vp-table">' + rows + '</table>' +
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

  // Popup STANDALONE partajat (un singur balon pe hartă). NU folosim mk.bindPopup pentru că acela adaugă
  // un al doilea handler de click pe marker (toggle Leaflet) care intra în conflict cu al nostru și închidea
  // balonul la al doilea click. Cu un popup deschis prin map.openPopup, singurul trigger e marker.on('click').
  function getVpPopup() {
    if (!window._vpPopup) {
      window._vpPopup = L.popup({ maxWidth: 330, minWidth: 290, className: 'vp-popup', autoPanPadding: [40, 80], closeButton: true });
    }
    return window._vpPopup;
  }

  // Deschide balonul pe markerul vehiculului.
  window.openVehiclePopup = function (imei) {
    var map = MAP(), mks = MKS();
    if (!map || !mks) { if (window.selectDevice) window.selectDevice(imei); return; }
    ensureHooks();
    var mk = mks.get(imei); if (!mk) return;
    var pop = getVpPopup();
    window._vpOpenImei = imei;
    pop.setLatLng(mk.getLatLng()).setContent(buildHtml(imei));
    map.openPopup(pop);
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
    if (fullCache[imei]) applyFull(imei); // randare instant din cache (brand/șofer); ancorele staționare/motor se reîmprospătează prin re-fetch mai jos
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
    renderDur(imei);
  }

  // Update DOAR câmpurile live (fără rebuild → fără flicker pe adresă/șofer, fără a închide meniul nav).
  function updateLiveFields(imei) {
    var d = DEVS() && DEVS().get(imei); if (!d) return;
    var b = liveBits(d);
    var dot = el('vp-dot-' + imei); if (dot) { dot.style.background = b.dot; dot.style.boxShadow = '0 0 7px ' + b.dot; }
    var st = el('vp-status-' + imei); if (st) st.textContent = b.status;
    var sp = el('vp-spd-' + imei); if (sp) { sp.textContent = b.speed + ' km/h'; sp.style.color = b.moving ? 'var(--green)' : 'var(--text-muted)'; }
    var slp = el('vp-splim-' + imei); if (slp) { var _lv = spdLimitOf(d); if (_lv) { slp.textContent = _lv; slp.style.display = ''; slp.classList.toggle('over', (b.speed || 0) > _lv); } else { slp.style.display = 'none'; } }
    var co = el('vp-coord-' + imei); if (co) co.textContent = b.lat + ', ' + b.lng + '  ·  ' + b.ang;
    var tm = el('vp-tx-' + imei); if (tm) tm.textContent = b.ts;
    renderDur(imei);
  }

  // Refresh dacă balonul vehiculului e deschis (date live). Apelat din updateMarker.
  window.vpRefreshIfOpen = function (imei) {
    try {
      if (window._vpOpenImei !== imei) return;
      var pop = window._vpPopup; if (!pop || !pop.isOpen || !pop.isOpen()) return;
      var mks = MKS(); var mk = mks && mks.get(imei);
      if (mk && pop.setLatLng) pop.setLatLng(mk.getLatLng()); // balonul urmează markerul dacă se mișcă
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

  // Hook-uri pe hartă: drag manual oprește follow-ul; închiderea balonului resetează starea „deschis".
  function ensureHooks() {
    var map = MAP(); if (!map || map.__vpHooked) return; map.__vpHooked = true;
    map.on('dragstart', function () { if (window._followImei) window.vpClearFollow(); });
    map.on('popupclose', function (e) { if (e.popup === window._vpPopup) window._vpOpenImei = null; });
  }

  // Închide meniul nav (Google/Waze) la click în afara lui.
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (t && t.closest && t.closest('.vp-nav')) return; // butonul Localizare își face singur toggle
    document.querySelectorAll('.vp-navmenu.show').forEach(function (m) { if (!m.contains(t)) m.classList.remove('show'); });
  });
})();
