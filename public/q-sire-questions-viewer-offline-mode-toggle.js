// public/q-sire-questions-viewer-offline-mode-toggle.js
// C.S.V. BEACON — SIRE Viewer Offline Mode Toggle
// Adds Open Offline Mode / Return Online Mode buttons to the Offline Package panel.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-OFFLINE-MODE-TOGGLE-20260528_1";
  const FORCE_KEY = "csvb_sire_viewer_force_offline";
  const PANEL_ID = "csvbSireViewerOfflinePanel";
  const BUTTON_ID = "csvbSireOfflineModeToggleBtn";

  window.CSVB_SIRE_VIEWER_OFFLINE_MODE_TOGGLE_BUILD = BUILD;

  function isForcedOffline() {
    try {
      return localStorage.getItem(FORCE_KEY) === "1";
    } catch (_) {
      return false;
    }
  }

  async function hasLocalPackage() {
    try {
      const health = await window.CSVB_SIRE_VIEWER_OFFLINE?.healthCheck?.();
      if (health?.has_package === true) return true;
      if (Number(health?.question_count || 0) > 0) return true;
    } catch (_) {}

    try {
      const pkg = await window.CSVB_SIRE_VIEWER_OFFLINE?.getPackage?.();
      if (pkg && Array.isArray(pkg.rows) && pkg.rows.length > 0) return true;
    } catch (_) {}

    return false;
  }

  function reloadViewer() {
    window.location.href = "./q-sire-questions-viewer.html";
  }

  async function openOfflineMode() {
    const available = await hasLocalPackage();

    if (!available) {
      alert(
        "No local SIRE Questions Viewer offline package is available on this browser.\n\n" +
        "Open the Viewer online, confirm that an active SIRE offline grant exists, then click Download Package first."
      );
      return;
    }

    try {
      localStorage.setItem(FORCE_KEY, "1");
    } catch (_) {}

    reloadViewer();
  }

  function returnOnlineMode() {
    try {
      localStorage.removeItem(FORCE_KEY);
    } catch (_) {}

    reloadViewer();
  }

  function actionsHost() {
    const panel = document.getElementById(PANEL_ID);
    if (!panel) return null;
    return panel.querySelector(".csvb-sire-offline-actions");
  }

  function syncButtonState(btn) {
    const forced = isForcedOffline();

    btn.textContent = forced ? "Return Online Mode" : "Open Offline Mode";
    btn.title = forced
      ? "Return to normal online SIRE Viewer mode."
      : "Force this browser to open the downloaded read-only offline package.";
    btn.className = forced ? "" : "primary";
  }

  function injectButton() {
    const host = actionsHost();
    if (!host) return;

    let btn = document.getElementById(BUTTON_ID);

    if (!btn) {
      btn = document.createElement("button");
      btn.id = BUTTON_ID;
      btn.type = "button";
      btn.dataset.csvbOfflineModeToggle = "1";

      btn.addEventListener("click", async () => {
        if (isForcedOffline()) {
          returnOnlineMode();
        } else {
          await openOfflineMode();
        }
      });

      host.appendChild(btn);
    }

    syncButtonState(btn);
  }

  function boot() {
    window.CSVB_SIRE_VIEWER_OFFLINE_MODE_TOGGLE = {
      BUILD,
      injectButton,
      openOfflineMode,
      returnOnlineMode,
      isForcedOffline
    };

    injectButton();
    setInterval(injectButton, 1000);

    if (window.MutationObserver) {
      const observer = new MutationObserver(() => injectButton());
      observer.observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
