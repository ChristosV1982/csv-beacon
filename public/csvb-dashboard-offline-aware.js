// public/csvb-dashboard-offline-aware.js
// C.S.V. BEACON — Dashboard Offline-Aware Warning Helper
// Phase 1 PWA foundation only.
// Visual messaging only. No Supabase writes. No sync execution. No module business logic.

(() => {
  "use strict";

  const BUILD = "DASHBOARD-OFFLINE-AWARE-2026-05-26-PHASE1-U03";
  const CONTROLLED_ATTR = "data-csvb-offline-aware";

  function isOfflineLike() {
    return navigator.onLine === false;
  }

  function isFetchOrServerWarning(text) {
    const s = String(text || "").toLowerCase();
    return s.includes("failed to fetch") ||
      s.includes("typeerror: failed to fetch") ||
      s.includes("supabase js not loaded") ||
      s.includes("check @supabase/supabase-js script tag") ||
      s.includes("networkerror") ||
      s.includes("load failed") ||
      s.includes("could not load company module access") ||
      s.includes("could not load companies");
  }

  function controlledOfflineMessage() {
    return [
      "Offline / server unreachable.",
      "The Dashboard shell is running from cached C.S.V. BEACON files.",
      "Server-based data may not refresh until connection is restored.",
      "Offline operational sync is not active yet in this phase."
    ].join("\n");
  }

  function ensureWarnBox() {
    return document.getElementById("warnBox");
  }

  function setControlledWarnBox() {
    const warn = ensureWarnBox();
    if (!warn) return;

    const wanted = controlledOfflineMessage();
    if (String(warn.textContent || "") !== wanted) {
      warn.textContent = wanted;
    }

    warn.style.display = "block";
    warn.setAttribute(CONTROLLED_ATTR, "1");
  }

  function normaliseWarnBox() {
    const warn = ensureWarnBox();
    if (!warn) return;

    const text = String(warn.textContent || "").trim();

    if (isOfflineLike()) {
      setControlledWarnBox();
      return;
    }

    if (text && isFetchOrServerWarning(text)) {
      setControlledWarnBox();
    }
  }

  function installWarnBoxObserver() {
    const warn = ensureWarnBox();
    if (!warn || warn.dataset.csvbOfflineObserver === "1") return;

    warn.dataset.csvbOfflineObserver = "1";

    const observer = new MutationObserver(() => {
      normaliseWarnBox();
    });

    observer.observe(warn, {
      childList: true,
      characterData: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"]
    });
  }

  function patchShowWarn() {
    if (typeof window.showWarn !== "function") return;
    if (window.showWarn.__csvbOfflineAwareWrapped === true) return;

    const originalShowWarn = window.showWarn;

    const wrappedShowWarn = function csvbOfflineAwareShowWarn(message) {
      if (isOfflineLike() || isFetchOrServerWarning(message)) {
        return originalShowWarn(controlledOfflineMessage());
      }
      return originalShowWarn(message);
    };

    wrappedShowWarn.__csvbOfflineAwareWrapped = true;
    wrappedShowWarn.__csvbOriginalShowWarn = originalShowWarn;
    window.showWarn = wrappedShowWarn;
  }

  function softenStatusText() {
    const root = document.getElementById("csvbOfflineStatusRoot");
    const label = root?.querySelector?.(".csvb-offline-text");
    if (!label) return;

    const text = String(label.textContent || "").trim().toLowerCase();
    if (text.includes("server connection available")) {
      label.textContent = "Online — app shell loaded";
    }
  }

  function tick() {
    patchShowWarn();
    installWarnBoxObserver();
    normaliseWarnBox();
    softenStatusText();
  }

  function boot() {
    window.CSVB_DASHBOARD_OFFLINE_AWARE_BUILD = BUILD;

    tick();

    // Dashboard may issue several delayed async requests. While offline, keep
    // enforcing the controlled message so raw async fetch errors cannot remain.
    [100, 250, 500, 750, 1000, 1500, 2000, 3000, 5000, 8000, 12000, 20000, 30000, 45000, 60000].forEach((ms) => {
      setTimeout(tick, ms);
    });

    window.addEventListener("offline", tick);
    window.addEventListener("online", tick);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
