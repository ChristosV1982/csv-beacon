// public/service-worker.js
// C.S.V. BEACON — Service Worker
// Phase 1 PWA foundation.
//
// Purpose:
// - Keep HTML pages/scripts fresh enough to avoid stale UI.
// - Preserve basic cached app-shell availability.
// - Provide a robust offline fallback for failed navigations.
//
// Explicit non-scope:
// - No offline data writes.
// - No sync execution.
// - No module business logic.

const CACHE_PREFIX = "sire-test-";
const CACHE_VERSION = "v128-cache-supabase-cdn-20260526";
const CACHE_NAME = `${CACHE_PREFIX}${CACHE_VERSION}`;
const OFFLINE_FALLBACK_URL = "./offline.html";

const EXTERNAL_RUNTIME_ASSETS = [
  "https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"
];

const INLINE_OFFLINE_HTML = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>C.S.V. BEACON — Offline</title>
  <style>
    body{margin:0;min-height:100vh;background:#F4F8FC;color:#163457;font-family:Arial,Helvetica,sans-serif;}
    .topbar{padding:12px 16px;background:#062A5E;color:#fff;font-weight:900;}
    .wrap{width:min(900px,calc(100vw - 24px));margin:40px auto;}
    .card{background:#fff;border:1px solid #D6E4F5;border-radius:16px;padding:20px;box-shadow:0 12px 30px rgba(3,27,63,.10);}
    h1{margin:0 0 8px;color:#062A5E;}
    p{line-height:1.45;}
    .warn{margin:14px 0;padding:12px;border:1px solid #F6D58F;border-radius:12px;background:#FFF6E0;color:#8A5A00;font-weight:800;}
    button{border:1px solid #062A5E;border-radius:10px;background:#062A5E;color:#fff;padding:9px 13px;font-weight:900;cursor:pointer;}
  </style>
</head>
<body>
  <div class="topbar">C.S.V. BEACON</div>
  <main class="wrap">
    <section class="card">
      <h1>You are offline</h1>
      <p>The device currently has no network connection.</p>
      <div class="warn">Offline operational modules are not active yet. This is a safe fallback page only.</div>
      <button onclick="location.href='./q-dashboard.html'">Go to Dashboard</button>
    </section>
  </main>
</body>
</html>`;

const CORE_ASSETS = [
  "./",
  "./index.html",
  "./q-dashboard.html",
  OFFLINE_FALLBACK_URL,
  "./su-admin.html",
  "./su-admin.js",
  "./csvb-onboard-personnel-admin.js",
  "./csvb-onboard-personnel-admin-u02d-fix.js",
  "./csvb-onboard-personnel-terminology-u04.js",
  "./csvb-user-edit-u05.js",
  "./csvb-hide-apply-onboard-setup-u05c.js",
  "./csvb-rights-matrix-ranks-u06.js",
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
  "./csvb-dashboard-area-home.js",
  "./csvb-platform-areas-admin.js",
  "./style.css",
  "./csv-beacon-theme.css",
  "./auth.js",
  "./csvb-module-guard.js",
  "./csvb-ui-polish.css",
  "./csvb-ui-polish.js",
  "./csvb-question-admin.js",
  "./csvb-question-overrides-admin.js",
  "./csvb-dashboard-polish.css",
  "./csvb-dashboard-polish.js",
  "./csvb-dashboard-threads-badge.js",
  "./csvb-dashboard-pla-extension.js",
  "./csvb-dashboard-marine-area-stabilizer.js",
  "./csvb-offline-status.js",
  "./csvb-offline-db.js",
  "./csvb-sync-queue.js",
  "./csvb-sw-register.js",
  "./csvb-offline-diagnostics.js",
  "./portable-lifting-appliances-wires.html",
  "./portable-lifting-appliances-wires.js",
  "./portable-lifting-appliances-wire-component.js",
  "./portable-lifting-appliances-wire-component.html",
  "./csvb-checkbox-dropdown-filters.js",
  "./portable-lifting-appliances-register-u05.js",
  "./csvb-dashboard-rank-access-u07.js",
  "./csvb-toast-messages.js",
  "./mooring-anchoring-event-workspace-extension.js",
  "./mooring-anchoring-evidence-upload-fix.js",
  "./mooring-anchoring-inventories-v4.html",
  "./mooring-anchoring-inventories-v4.css",
  "./mooring-anchoring-inventories-v4.js",
  "./mooring-anchoring-action-guard-u10.js",
  "./mooring-anchoring-permissions-u10.js",
  "./mooring-anchoring-register-component-v4.js",
  "./mooring-anchoring-component-delete-extension.js",
  "./mooring-anchoring-operations.html",
  "./mooring-anchoring-operations.css",
  "./mooring-anchoring-operations.js",
  "./mooring-anchoring-component.html",
  "./mooring-anchoring-component.css",
  "./mooring-anchoring-component.js",
  "./mooring-anchoring-office-lock-guard-u09d.js",
  "./mooring-anchoring-checklist-run-actions-extension.js",
  "./assets/csv-beacon-icon.png",
  "./assets/csv-beacon-logo-full.png",
  "./icon-192.png",
  "./icon-512.png",
  "./sire_questions_all_columns_named.json"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      // Critical fallback: try to cache offline.html first.
      // If the file is unexpectedly unavailable, store an inline fallback response.
      try {
        await cache.add(OFFLINE_FALLBACK_URL);
      } catch (_) {
        await cache.put(
          OFFLINE_FALLBACK_URL,
          new Response(INLINE_OFFLINE_HTML, {
            status: 200,
            headers: { "Content-Type": "text/html; charset=utf-8" }
          })
        );
      }

      // Non-critical app-shell assets. Missing files must not block activation.
      await Promise.allSettled(
        CORE_ASSETS
          .filter((asset) => asset !== OFFLINE_FALLBACK_URL)
          .map(async (asset) => {
            try {
              await cache.add(asset);
            } catch (_) {
              // Non-critical cache miss. Runtime network-first remains active.
            }
          })
      );

      // External runtime assets used by the Dashboard shell.
      // These are cached so the already-installed app shell can still load offline.
      await Promise.allSettled(
        EXTERNAL_RUNTIME_ASSETS.map(async (asset) => {
          try {
            await cache.add(asset);
          } catch (_) {
            // If CDN is unavailable during install, runtime cache will try later.
          }
        })
      );

      await self.skipWaiting();
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

function inlineOfflineResponse() {
  return new Response(INLINE_OFFLINE_HTML, {
    status: 200,
    headers: { "Content-Type": "text/html; charset=utf-8" }
  });
}

function isExternalRuntimeAsset(url) {
  return EXTERNAL_RUNTIME_ASSETS.includes(url.href);
}

async function offlineFallback(cache) {
  const fallback = await cache.match(OFFLINE_FALLBACK_URL);
  return fallback || inlineOfflineResponse();
}

async function networkFirst(request, useOfflineFallback = false) {
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

    if (useOfflineFallback) {
      return await offlineFallback(cache);
    }

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

  return cached || (await fetchPromise) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const req = event.request;

  if (req.method !== "GET") return;

  const url = new URL(req.url);

  if (isExternalRuntimeAsset(url)) {
    event.respondWith(staleWhileRevalidate(req));
    return;
  }

  if (url.origin !== self.location.origin) return;

  const accept = req.headers.get("accept") || "";
  const isHTML =
    req.mode === "navigate" ||
    accept.includes("text/html") ||
    url.pathname.endsWith(".html");

  if (isHTML) {
    event.respondWith(networkFirst(req, true));
  } else {
    event.respondWith(staleWhileRevalidate(req));
  }
});
