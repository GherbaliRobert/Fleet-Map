// Service worker — PWA (instalabil + shell offline) + Web Push pentru RA Track
const CACHE = 'ratracks-v276';
const SHELL = ['/app', '/index.html', '/css/app.css', '/manifest.json', '/icon.svg', '/icon-192.png', '/logo-mark.png', '/logo-mark-light.png', '/vendor/leaflet-heat.js'];

self.addEventListener('install', function (e) {
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL).catch(() => {})));
});

self.addEventListener('activate', function (e) {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', function (e) {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  // Nu intercepta API, WebSocket sau alt origin — datele sunt mereu live
  if (url.origin !== self.location.origin || url.pathname.startsWith('/api')) return;
  // HTML + CSS + JS: network-first (cod proaspăt la fiecare actualizare), cu fallback offline.
  // CSS-ul era cache-first => actualizarile de stil nu apareau pana la schimbarea versiunii cache.
  // JS-ul avea ACEEAȘI problemă, dar mai gravă: index.html (network-first) se actualiza, iar fișierele
  // din /js rămâneau vechi => cod nou care apelează funcții pe care fișierul vechi nu le cheamă niciodată.
  // Așa a apărut „am debifat sus, lista din stânga n-a reacționat": map-tools.js era versiunea din cache.
  if (req.mode === 'navigate' || url.pathname.endsWith('.css') || url.pathname.endsWith('.js')) {
    e.respondWith(
      fetch(req).then(res => {
        const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy));
        return res;
      }).catch(() => caches.match(req).then(c => c || caches.match('/index.html')))
    );
    return;
  }
  // static (icoane, vendor): cache-first cu populare la prima cerere
  e.respondWith(caches.match(req).then(cached => cached || fetch(req).then(res => {
    const copy = res.clone(); caches.open(CACHE).then(c => c.put(req, copy));
    return res;
  }).catch(() => cached)));
});

// ─── Web Push ───
self.addEventListener('push', function (event) {
  let data = {};
  try { data = event.data ? event.data.json() : {}; }
  catch (e) { data = { title: 'RA Tracks', body: event.data ? event.data.text() : '' }; }
  const title = data.title || 'RA Tracks';
  event.waitUntil(self.registration.showNotification(title, {
    body: data.body || '',
    icon: '/icon-192.png',
    badge: '/icon-192.png',
    tag: data.tag || undefined,
    renotify: false
  }));
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (list) {
      for (const c of list) { if ('focus' in c) return c.focus(); }
      if (self.clients.openWindow) return self.clients.openWindow('/app');
    })
  );
});
