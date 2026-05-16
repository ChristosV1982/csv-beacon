// public/csvb-dashboard-platform-areas.js
// C.S.V. BEACON – Dashboard Platform Areas
// EMERGENCY SAFE MODE: optional platform-area overlay disabled to restore dashboard stability.
// Original dashboard card grid remains available.

(() => {
  "use strict";

  const BUILD = "PA6-SAFE-DISABLED-20260516-1";

  function publish() {
    window.CSVB_DASHBOARD_PLATFORM_AREAS = {
      build: BUILD,
      source: "safe-disabled",
      areas: [],
      refresh: () => {},
      reload: () => window.location.reload()
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", publish);
  } else {
    publish();
  }

  setTimeout(publish, 250);
  setTimeout(publish, 1000);
})();
