// sw.js — TV-2 kiosk SW
const CACHE = 'tv2-cache-v14';

const ASSETS = [
  '/tv2/',
  '/tv2/index.html',
  '/tv2/styles.css',
  '/tv2/script.js',
  '/tv2/img/fn-draft2.mp4',
  '/tv2/music/nature-dreamscape-350256.mp3',
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).catch(() => {})
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Only handle GETs
  if (req.method !== 'GET') return;

  // Let range requests (video scrubbing) hit network directly
  if (req.headers.has('range')) {
    event.respondWith(fetch(req));
    return;
  }

  // Never cache live runtime state (keep mode switches fresh)
  if (url.pathname.endsWith('/runtime/state.json')) {
    event.respondWith(fetch(req, { cache: 'no-store' }));
    return;
  }

  // For cross-origin requests, just pass through
  if (url.origin !== self.location.origin) {
    event.respondWith(fetch(req));
    return;
  }

  // Cache-first for everything else (shell + video)
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((resp) => {
        if (resp && resp.ok) {
          const copy = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return resp;
      }).catch(() => cached || Promise.reject());
    })
  );
});

