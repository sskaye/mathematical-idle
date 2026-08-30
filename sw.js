/* Service worker: network-first with cache fallback, so the game always loads
 * fresh when online but still opens with no connection. */
'use strict';

const CACHE = 'qed-v1';
const SHELL = [
  './', 'index.html', 'css/style.css',
  'js/decimal.js', 'js/format.js', 'js/params.js', 'js/logic.js',
  'js/save.js', 'js/ui.js', 'js/main.js',
  'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    fetch(e.request)
      .then(resp => {
        const copy = resp.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return resp;
      })
      .catch(() => caches.match(e.request, { ignoreSearch: true }))
  );
});
