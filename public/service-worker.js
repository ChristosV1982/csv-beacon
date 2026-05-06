// public/service-worker.js
// Goal: stop “stale” pages/scripts forcing multiple hard refreshes.
// Strategy:
// - Network-first for HTML navigations (always try to fetch latest)
// - Stale-while-revalidate for static assets (fast, but updates in background)
// - Bump cache version + clean old caches on activate

const CACHE_PREFIX = "sire-test-";
const CACHE_VERSION = "v73-company-policy-shell";              // <-- bump this if you change caching behavior again
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./company_policy.html",
  "./company_policy.js",
  "./style.css",
  "./csv-beacon-theme.css",
  "./auth.js",
  "./csvb-module-guard.js",
  "./csvb-ui-polish.js",
  "./csvb-question-admin.js",
  "./csvb-question-overrides-admin.js",
  "./assets/csv-beacon-icon.png",
  "./assets/csv-beacon-logo-full.png",
  "./icon-192.png",
  "./icon-512.png",
  "./sire_questions_all_columns_named.json"
];

// Install: pre-cache core assets (best effort) + activate immediately
self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(CORE_ASSETS);
      } catch (e) {
        // If any asset fails to cache, still proceed (do not block install)
      } finally {
        await self.skipWaiting();
      }
    })()
  );
});

// Activate: remove old caches + take control immediately
self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => k.startsWith(CACHE_PREFIX) && k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      );
      await self.clients.claim();
    })()
  );
});

// Helpers
async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const fresh = await fetch(request, { cache: "no-store" });
    // Cache only valid responses
    if (fresh && fresh.ok) {
      cache.put(request, fresh.clone());
    }
    return fresh;
  } catch (e) {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw e;
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const fetchPromise = fetch(request)
    .then((fresh) => {
      if (fresh && fresh.ok) cache.put(request, fresh.clone());
      return fresh;
    })
    .catch(() => null);

  // If cached exists, return it immediately; otherwise wait for network
  return cached || (await fetchPromise) || cached;
}

// Fetch handling
self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get("accept") || "";
  const isHTML =
    req.mode === "navigate" ||
    accept.includes("text/html") ||
    url.pathname.endsWith(".html");

  if (isHTML) {
    event.respondWith(networkFirst(req));
  } else {
    event.respondWith(staleWhileRevalidate(req));
  }
});