/* service-worker.js
   Bump CACHE_NAME when you want to force clients to refresh cached assets.
*/
const CACHE_NAME = "sire-2-questionnaire-2026-v1.1";

// Keep precache minimal and stable; add icons later once they exist.
const PRECACHE_URLS = [
  "./",
  "./index.html",
  "./app.js",
  "./style.css",
  "./print.js",
  "./manifest.json",
  "./sire_questions_all_columns_named.json",
];

// Install: cache core assets (tolerant to missing files)
self.addEventListener("install", (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);

    // Cache each asset individually so one missing file doesn't fail the install.
    await Promise.allSettled(
      PRECACHE_URLS.map(async (url) => {
        try {
          const resp = await fetch(url, { cache: "no-cache" });
          if (resp && resp.ok) {
            await cache.put(url, resp.clone());
          }
        } catch (_) {
          // Ignore caching failures; app can still work online.
        }
      })
    );

    self.skipWaiting();
  })());
});

// Activate: remove old caches and take control
self.addEventListener("activate", (event) => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(
      keys
        .filter((k) => k !== CACHE_NAME)
        .map((k) => caches.delete(k))
    );
    await self.clients.claim();
  })());
});

// Fetch strategy:
// - HTML navigations: network-first, fallback to cached index.html
// - Other GET: cache-first, fallback to network, then store
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  const req = event.request;
  const accept = req.headers.get("accept") || "";
  const isNavigation = req.mode === "navigate" || accept.includes("text/html");

  if (isNavigation) {
    event.respondWith((async () => {
      try {
        const fresh = await fetch(req);
        const cache = await caches.open(CACHE_NAME);
        cache.put("./index.html", fresh.clone()).catch(() => {});
        return fresh;
      } catch (_) {
        const cached = await caches.match("./index.html");
        return cached || new Response("Offline", { status: 503, statusText: "Offline" });
      }
    })());
    return;
  }

  event.respondWith((async () => {
    const cached = await caches.match(req);
    if (cached) return cached;

    try {
      const fresh = await fetch(req);
      const cache = await caches.open(CACHE_NAME);
      cache.put(req, fresh.clone()).catch(() => {});
      return fresh;
    } catch (_) {
      return new Response("Offline", { status: 503, statusText: "Offline" });
    }
  })());
});
