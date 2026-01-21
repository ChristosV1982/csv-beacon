// public/service-worker.js
// Dev-friendly strategy: network-first for HTML/JS/CSS so code updates appear immediately.
// Still caches assets for performance/offline fallback.

const CACHE_NAME = "sire-test-v2"; // IMPORTANT: bump this when you change caching logic

const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./style.css",
  "./sire_questions_all_columns_named.json",
  "./print.js",
  "./icon-192.png",
  "./icon-512.png",
];

// Install: pre-cache core assets
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
  self.skipWaiting();
});

// Activate: remove old caches
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith("sire-test-") && k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isNetworkFirst(url) {
  // Always network-first for pages + code + styles (most likely to change)
  return (
    url.pathname.endsWith(".html") ||
    url.pathname.endsWith(".js") ||
    url.pathname.endsWith(".css") ||
    url.pathname.endsWith(".json")
  );
}

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request);
    cache.put(request, fresh.clone());
    return fresh;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("Offline and no cache available");
  }
}

async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;
  const fresh = await fetch(request);
  const cache = await caches.open(CACHE_NAME);
  cache.put(request, fresh.clone());
  return fresh;
}

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);

  // Only handle same-origin requests
  if (url.origin !== self.location.origin) return;

  event.respondWith(isNetworkFirst(url) ? networkFirst(req) : cacheFirst(req));
});
