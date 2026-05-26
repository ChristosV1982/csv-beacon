// public/csvb-device-gate.js
// C.S.V. BEACON — Device Gate Safe Mode
// Emergency no-block version. Device registration remains available, but access blocking is disabled.

(() => {
  "use strict";

  const BUILD = "DEVICE-GATE-SAFE-MODE-2026-05-26";

  function clearGate() {
    try {
      document.body?.classList?.remove("csvb-device-gate-active");
      document.getElementById("csvbDeviceGateOverlay")?.remove();
    } catch (_) {}

    const out = {
      build: BUILD,
      checked_at: new Date().toISOString(),
      allowed: true,
      safe_mode: true,
      reason: "Device gate blocking is disabled."
    };

    window.CSVB_DEVICE_GATE_STATUS = out;
    return Promise.resolve(out);
  }

  window.CSVB_DEVICE_GATE = {
    BUILD,
    checkGate: clearGate,
    clearGate,
    showGate: clearGate,
    getDevicePublicId() {
      try {
        return window.CSVB_DEVICE?.getDevicePublicId?.() || localStorage.getItem("csvb_device_public_id") || "";
      } catch (_) {
        return "";
      }
    }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", clearGate);
  } else {
    clearGate();
  }
})();
