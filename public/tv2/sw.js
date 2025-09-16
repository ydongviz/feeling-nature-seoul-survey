const CACHE = 'tv2-cache-v10';  // <= bump this when you change assets
const ASSETS = [
  '/tv2/',
  '/tv2/index.html',
  '/tv2/styles.css',
  '/tv2/script.js',
  '/tv2/img/fn-draft2.mp4'
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate', (e) => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))) .then(()=>self.clients.claim()));
});
self.addEventListener('fetch', (e) => {
  const { request } = e;
  if (request.url.includes('/public/runtime/state.json')) return; // network for live state
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request).then(resp => {
      const clone = resp.clone(); caches.open(CACHE).then(c => c.put(request, clone)).catch(()=>{});
      return resp;
    }))
  );
});
