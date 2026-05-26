// public/csvb-dashboard-offline-aware.js
// C.S.V. BEACON — Dashboard Offline-Aware Warning Helper
// Phase 1 PWA foundation only.
// Visual messaging only. No Supabase writes. No sync execution. No module business logic.

(() => {
  "use strict";

  const BUILD = "DASHBOARD-OFFLINE-AWARE-2026-05-26-PHASE1";

  function isFetchOrServerWarning(text) {
    const s = String(text || "").toLowerCase();
    return s.includes("failed to fetch") ||
      s.includes("supabase js not loaded") ||
      s.includes("networkerror") ||
      s.includes("load failed");
  }

  function controlledOfflineMessage() {
    return [
      "Offline / server unreachable.",
      "The Dashboard shell is running from cached C.S.V. BEACON files.",
      "Server-based data may not refresh until connection is restored.",
      "Offline operational sync is not active yet in this phase."
    ].join("\n");
  }

  function normaliseWarnBox() {
    const warn = document.getElementById("warnBox");
    if (!warn) return;

    const text = String(warn.textContent || "").trim();
    if (!text || !isFetchOrServerWarning(text)) return;

    warn.textContent = controlledOfflineMessage();
    warn.style.display = "block";
    warn.dataset.csvbOfflineAware = "1";
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

  function boot() {
    window.CSVB_DASHBOARD_OFFLINE_AWARE_BUILD = BUILD;

    normaliseWarnBox();
    softenStatusText();

    // The Dashboard loads several scripts and async RPC calls. Re-check briefly
    // so late fetch failures are converted to a controlled offline message.
    [250, 750, 1500, 3000, 6000].forEach((ms) => {
      setTimeout(() => {
        normaliseWarnBox();
        softenStatusText();
      }, ms);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
