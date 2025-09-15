// sw.js — tv2-cache-v8
const CACHE = "tv2-cache-v8";

// List only the core shell assets you actually ship at /tv2/
const PRECACHE_URLS = [
  "./",            // resolves to /tv2/
  "./index.html",
  "./styles.css",
  "./script.js",
  // add your video asset(s) if you want them cached for offline preview:
  '/tv2/img/fn-draft2.mp4'
];

self.addEventListener("install", (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(PRECACHE_URLS).catch(() => {}))
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Never cache live runtime state
  if (url.pathname.endsWith("/runtime/state.json")) {
    event.respondWith(fetch(request, { cache: "no-store" }).catch(() => fetch(request)));
    return;
  }

  // For everything else: cache-first fallback to network
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request).then((resp) => {
        // Only cache GET & same-origin successful responses
        if (
          request.method === "GET" &&
          resp.ok &&
          url.origin === self.location.origin
        ) {
          const clone = resp.clone();
          caches.open(CACHE).then((cache) => cache.put(request, clone));
        }
        return resp;
      }).catch(() => cached || Promise.reject());
    })
  );
});
