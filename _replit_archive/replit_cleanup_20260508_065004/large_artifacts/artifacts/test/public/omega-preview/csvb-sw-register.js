// public/csvb-sw-register.js
// C.S.V. BEACON — PWA registration helper.
// Phase 1 only. No database writes. No module business logic.

(() => {
  "use strict";

  const BUILD = "SWREG-2026-05-26-PHASE1";
  const SW_URL = "./service-worker.js";

  const status = {
    build: BUILD,
    supported: "serviceWorker" in navigator,
    registered: false,
    controlled: false,
    scope: "",
    error: "",
  };

  function publish() {
    status.controlled = !!navigator.serviceWorker?.controller;
    window.CSVB_SW_STATUS = { ...status };
    return status;
  }

  async function start() {
    publish();

    if (!status.supported) {
      status.error = "Service worker not supported.";
      publish();
      return status;
    }

    try {
      const reg = await navigator.serviceWorker.register(SW_URL, { scope: "./" });
      status.registered = true;
      status.scope = reg.scope || "./";
      status.error = "";
      try { await reg.update(); } catch (_) {}
    } catch (e) {
      status.registered = false;
      status.error = String(e?.message || e || "Registration failed.");
    }

    publish();
    return status;
  }

  window.CSVB_SW_REGISTER = { BUILD, start, status };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
