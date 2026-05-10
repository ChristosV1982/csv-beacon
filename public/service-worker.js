// public/service-worker.js
// Goal: stop “stale” pages/scripts forcing multiple hard refreshes.
// Strategy:
// - Network-first for HTML navigations
// - Stale-while-revalidate for static assets
// - Bump cache version + clean old caches on activate

const CACHE_PREFIX = "sire-test-";
const CACHE_VERSION = "v101-dashboard-platform-areas-supabase";
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./q-dashboard.html",
  "./company_policy.html",
  "./company_policy.js",
  "./company_policy_change_requests.js",
  "./company_policy_documents.js",
  "./company_policy_search.js",
  "./company_policy_ai_search.js",
  "./company_policy_permissions.js",
  "./company_policy_editor_assets.js",
  "./company_policy_editor_tables.js",
  "./company_policy_editor_blocks.js",
  "./company_policy_editor_paste_cleanup.js",
  "./company_policy_editor_import.js",
  "./company_policy_editor_import_splitter.js",
  "./company_policy_print_export.js",
  "./csvb-dashboard-platform-areas.js",
  "./style.css",
  "./csv-beacon-theme.css",
  "./auth.js",
  "./csvb-module-guard.js",
  "./csvb-ui-polish.js",
  "./csvb-question-admin.js",
  "./csvb-question-overrides-admin.js",
  "./csvb-dashboard-polish.js",
  "./csvb-dashboard-threads-badge.js",
  "./assets/csv-beacon-icon.png",
  "./assets/csv-beacon-logo-full.png",
  "./icon-192.png",
  "./icon-512.png",
  "./sire_questions_all_columns_named.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      try {
        const cache = await caches.open(CACHE_NAME);
        await cache.addAll(CORE_ASSETS);
      } catch (e) {
        // If any asset fails to cache, still proceed.
      } finally {
        await self.skipWaiting();
      }
    })()
  );
});

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

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);

  try {
    const fresh = await fetch(request, { cache: "no-store" });

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

  return cached || (await fetchPromise) || cached;
}

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