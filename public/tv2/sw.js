// Minimal offline cache for TV-2 assets (primarily the video)
const CACHE = 'tv2-cache-v1';
const ASSETS = [
  '/tv2/',                 // HTML
  '/tv2/index.html',
  '/tv2/script.js',
  '/tv2/styles.css',
  '/tv2/img/FN-draft.mp4'  // <-- replace if your final video path/name is different
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    ).then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  const { request } = e;
  // network-first for state.json (live), cache-first for local assets & video
  if (request.url.includes('/public/runtime/state.json')) return; // let network handle
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(resp => {
      // opportunistic caching
      const clone = resp.clone();
      caches.open(CACHE).then(c => c.put(request, clone)).catch(()=>{});
      return resp;
    }))
  );
});
