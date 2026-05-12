// public/csvb-dashboard-marine-area-stabilizer.js
// C.S.V. BEACON – Marine Applications dashboard compatibility shim
// PLA-03F: Marine Area is now stable from core dashboard config.

(() => {
  "use strict";

  const BUILD = "MARINE-AREA-SHIM-PLA03F-20260512-1";

  function publish() {
    window.CSVB_DASHBOARD_MARINE_AREA_STABILIZER = {
      build: BUILD,
      mode: "passive",
      areaHomeGroups:
        window.CSVB_DASHBOARD_AREA_HOME?.config?.marine_applications_vessel_interaction?.groups?.map((g) => ({
          title: g.title,
          items: (g.items || []).map((i) => i.cardKey),
        })) || []
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", publish);
  } else {
    publish();
  }

  setTimeout(publish, 1000);
  setTimeout(publish, 2500);
})();
