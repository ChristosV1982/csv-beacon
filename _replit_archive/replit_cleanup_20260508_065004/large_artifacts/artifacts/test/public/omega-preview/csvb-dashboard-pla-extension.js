// public/csvb-dashboard-pla-extension.js
// C.S.V. BEACON – PLA dashboard compatibility shim
// PLA-03F: dashboard card and area-home shortcuts are now native/stable.

(() => {
  "use strict";

  const BUILD = "PLA-DASH-SHIM-PLA03F-20260512-1";

  function cardVisible() {
    const card = document.querySelector('[data-card="portable_lifting_appliances_wires"]');
    return !!card && card.style.display !== "none";
  }

  function publish() {
    window.CSVB_DASHBOARD_PLA_EXTENSION_BUILD = BUILD;
    window.CSVB_PLA_DASHBOARD_CARD = {
      build: BUILD,
      allowed: cardVisible(),
      reason: "native dashboard card"
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", publish);
  } else {
    publish();
  }

  setTimeout(publish, 800);
  setTimeout(publish, 1800);
})();
