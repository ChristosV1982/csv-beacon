// public/q-sire-questions-viewer-online-helper-loader.js
// C.S.V. BEACON — SIRE Viewer online-only helper loader.
// Loads online-only helper scripts only after the main Viewer exposes a confirmed online state.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-ONLINE-HELPER-LOADER-20260528_1";
  window.CSVB_SIRE_VIEWER_ONLINE_HELPER_LOADER_BUILD = BUILD;

  const INTERVAL_MS = 250;
  const MAX_TICKS = 240;

  function isTruthyFlag(value) {
    const v = String(value || "").trim().toLowerCase();
    return v === "1" || v === "true" || v === "yes" || v === "on";
  }

  function offlineRequested() {
    try {
      const params = new URLSearchParams(window.location.search || "");
      const q = params.get("offline") || params.get("csvb_offline") || params.get("offline_package") || "";
      if (isTruthyFlag(q)) return true;
    } catch (_) {}

    try {
      if (localStorage.getItem("csvb_sire_viewer_force_offline") === "1") return true;
    } catch (_) {}

    return navigator.onLine === false;
  }

  function offlineActive() {
    return window.CSVB_SIRE_VIEWER_OFFLINE_ACTIVE === true ||
      document.documentElement.getAttribute("data-csvb-sire-offline") === "1";
  }

  function modeLineText() {
    return String(document.getElementById("modeLine")?.textContent || "");
  }

  function viewerReady() {
    return !!window.CSVB_SIRE_QUESTIONS_VIEWER;
  }

  function viewerIsConfirmedOnline() {
    const mode = modeLineText().toLowerCase();
    return viewerReady() &&
      !offlineRequested() &&
      !offlineActive() &&
      mode.includes("mode: read-only") &&
      !mode.includes("offline");
  }

  function viewerIsConfirmedOffline() {
    const mode = modeLineText().toLowerCase();
    return offlineRequested() ||
      offlineActive() ||
      (viewerReady() && mode.includes("offline"));
  }

  function helperNodes() {
    return Array.from(document.querySelectorAll("script[data-csvb-online-src]"));
  }

  function scriptAlreadyLoaded(src) {
    return Array.from(document.querySelectorAll("script[src]"))
      .some((node) => node.getAttribute("src") === src);
  }

  function loadScript(src) {
    return new Promise((resolve, reject) => {
      if (!src || scriptAlreadyLoaded(src)) {
        resolve();
        return;
      }

      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.defer = false;
      script.dataset.csvbLazyLoadedOnlineHelper = "1";

      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load online helper script: " + src));

      document.body.appendChild(script);
    });
  }

  async function loadOnlineHelpers() {
    if (!viewerIsConfirmedOnline()) return;

    const nodes = helperNodes();
    for (const node of nodes) {
      const src = String(node.getAttribute("data-csvb-online-src") || "").trim();
      if (!src) continue;
      await loadScript(src);
    }

    console.info("SIRE Viewer online helper loader: confirmed online mode; online-only helpers loaded.");
  }

  function waitForViewerDecision() {
    let ticks = 0;

    const timer = setInterval(() => {
      ticks += 1;

      if (viewerIsConfirmedOffline()) {
        clearInterval(timer);
        console.info("SIRE Viewer online helper loader: confirmed offline package mode; online-only helpers suppressed.");
        return;
      }

      if (viewerIsConfirmedOnline()) {
        clearInterval(timer);
        loadOnlineHelpers().catch((error) => {
          console.warn("SIRE Viewer online helper loader failed:", error);
        });
        return;
      }

      if (ticks >= MAX_TICKS) {
        clearInterval(timer);
        console.warn("SIRE Viewer online helper loader: no confirmed online/offline Viewer decision; online-only helpers suppressed.");
      }
    }, INTERVAL_MS);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", waitForViewerDecision);
  } else {
    waitForViewerDecision();
  }
})();
