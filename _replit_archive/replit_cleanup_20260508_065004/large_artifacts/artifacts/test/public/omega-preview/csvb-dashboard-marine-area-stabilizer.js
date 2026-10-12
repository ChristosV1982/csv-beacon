// public/csvb-dashboard-marine-area-stabilizer.js
// C.S.V. BEACON – Marine Applications dashboard compatibility shim
// PLA-03F: Marine Area is now stable from core dashboard config.
// RISQ-Viewer bridge: loads the RISQ Viewer Dashboard helper without replacing q-dashboard.html.

(() => {
  "use strict";

  const BUILD = "MARINE-AREA-SHIM-RISQ-VIEWER-20260520-2";

  function ensureRisqViewerHelperLoaded() {
    if (window.CSVB_DASHBOARD_RISQ_VIEWER_CARD_BUILD === "DASHBOARD-RISQ-VIEWER-CARD-20260520_2") return;
    if (document.querySelector('script[data-csvb-risq-viewer-card-loader="2"]')) return;

    const old = document.querySelector('script[data-csvb-risq-viewer-card-loader="1"]');
    if (old) old.remove();

    const script = document.createElement("script");
    script.src = "./csvb-dashboard-risq-viewer-card.js?v=20260520_2";
    script.defer = true;
    script.dataset.csvbRisqViewerCardLoader = "2";
    document.body.appendChild(script);
  }

  function publish() {
    ensureRisqViewerHelperLoaded();

    window.CSVB_DASHBOARD_MARINE_AREA_STABILIZER = {
      build: BUILD,
      mode: "passive_with_risq_viewer_bridge",
      areaHomeGroups:
        window.CSVB_DASHBOARD_AREA_HOME?.config?.marine_applications_vessel_interaction?.groups?.map((g) => ({
          title: g.title,
          items: (g.items || []).map((i) => i.cardKey),
        })) || [],
      risqViewerCardHelper: window.CSVB_DASHBOARD_RISQ_VIEWER_CARD_BUILD || "loading"
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", publish);
  } else {
    publish();
  }

  setTimeout(publish, 500);
  setTimeout(publish, 1000);
  setTimeout(publish, 2500);
  setTimeout(publish, 5000);
})();
