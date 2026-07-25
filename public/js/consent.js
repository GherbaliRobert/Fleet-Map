// consent.js — poarta de consimțământ pentru cookie-uri NEESENȚIALE (azi: Google Analytics 4).
//
// DE CE: până acum gtag se încărca necondiționat în <head>-ul fiecărei pagini — inclusiv pe
// confidentialitate.html, chiar pagina care declara „Nu folosim cookie-uri de publicitate/tracking".
// Bannerul avea un singur buton („Am înțeles"), fără posibilitate de refuz, și se afișa DUPĂ ce gtag
// pornise deja. GDPR/ePrivacy cer consimțământ PREALABIL și la fel de ușor de retras ca de acordat.
//
// CUM: analytics-ul nu se încarcă deloc până când vizitatorul apasă „Accept". Refuzul se ține minte la fel
// ca acceptul (altfel bannerul ar reapărea la fiecare pagină și ar împinge omul spre accept).
// Alegerea se poate schimba oricând: window.raConsentReset() sau linkul „Setări cookie-uri" din politică.
(function () {
  var GA_ID = 'G-CQCGC0C705';
  var KEY = 'ra_consent_v1'; // valori: 'granted' | 'denied'

  function get() { try { return localStorage.getItem(KEY); } catch (e) { return null; } }
  function set(v) { try { localStorage.setItem(KEY, v); } catch (e) {} }

  // Încarcă GA4 DOAR după consimțământ. IP anonimizat, fără semnale de publicitate.
  var loaded = false;
  function loadAnalytics() {
    if (loaded || !GA_ID) return;
    loaded = true;
    var s = document.createElement('script');
    s.async = true;
    s.src = 'https://www.googletagmanager.com/gtag/js?id=' + GA_ID;
    document.head.appendChild(s);
    window.dataLayer = window.dataLayer || [];
    window.gtag = function () { window.dataLayer.push(arguments); };
    window.gtag('js', new Date());
    window.gtag('config', GA_ID, { anonymize_ip: true, allow_google_signals: false, allow_ad_personalization_signals: false });
  }

  function removeBanner() { var b = document.getElementById('ra-consent'); if (b && b.parentNode) b.parentNode.removeChild(b); }

  function decide(v) { set(v); removeBanner(); if (v === 'granted') loadAnalytics(); }

  function showBanner() {
    if (document.getElementById('ra-consent')) return;
    var wrap = document.createElement('div');
    wrap.id = 'ra-consent';
    wrap.setAttribute('role', 'dialog');
    wrap.setAttribute('aria-label', 'Setări cookie-uri');
    wrap.style.cssText = 'position:fixed;left:12px;right:12px;bottom:12px;z-index:99999;max-width:760px;margin:0 auto;'
      + 'background:#11161B;border:1px solid #1F2730;border-radius:12px;padding:14px 16px;box-shadow:0 8px 30px rgba(0,0,0,.5);'
      + "font:14px/1.5 'Nunito',-apple-system,Segoe UI,Roboto,sans-serif;color:#E6EAF0;display:flex;align-items:center;gap:12px;flex-wrap:wrap;";
    var txt = document.createElement('span');
    txt.style.cssText = 'flex:1;min-width:220px;';
    txt.innerHTML = 'Cookie-urile <b>strict necesare</b> (autentificare) sunt mereu active. '
      + 'Ne ajuți cu <b>statistici anonime de trafic</b> (Google Analytics)? Poți refuza — site-ul funcționează identic. '
      + '<a href="/confidentialitate.html" style="color:#3FE07D">Detalii</a>.';
    // Cele două butoane au aceeași greutate vizuală: refuzul nu e ascuns sau descurajat.
    var no = document.createElement('button');
    no.type = 'button'; no.textContent = 'Refuz';
    no.style.cssText = 'background:transparent;color:#E6EAF0;border:1px solid #2A3542;border-radius:8px;padding:9px 18px;font-weight:700;cursor:pointer;font-family:inherit;';
    no.onclick = function () { decide('denied'); };
    var yes = document.createElement('button');
    yes.type = 'button'; yes.textContent = 'Accept';
    yes.style.cssText = 'background:#3FE07D;color:#06210F;border:none;border-radius:8px;padding:9px 18px;font-weight:700;cursor:pointer;font-family:inherit;';
    yes.onclick = function () { decide('granted'); };
    wrap.appendChild(txt); wrap.appendChild(no); wrap.appendChild(yes);
    document.body.appendChild(wrap);
  }

  // Retragerea consimțământului: GA4 rămâne încărcat până la reîncărcarea paginii, dar nu mai e reactivat.
  window.raConsentReset = function () { set(''); try { localStorage.removeItem(KEY); } catch (e) {} location.reload(); };
  window.raConsentState = function () { return get() || 'unset'; };

  var cur = get();
  if (cur === 'granted') loadAnalytics();
  else if (cur !== 'denied') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', showBanner);
    else showBanner();
  }
})();
