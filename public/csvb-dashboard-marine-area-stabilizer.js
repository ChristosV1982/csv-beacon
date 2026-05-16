// public/csvb-dashboard-marine-area-stabilizer.js
// C.S.V. BEACON – Dashboard compatibility shim
// PLA-03F: Marine Area is now stable from core dashboard config.
// SIRE-Viewer transition: soft-retire legacy Read-Only Library from visible dashboard counts.

(() => {
  "use strict";

  const BUILD = "DASHBOARD-SHIM-SIRE-LEGACY-LIBRARY-SOFT-RETIRED-20260516-1";
  const SOFT_RETIRED_CARD_KEYS = new Set(["library"]);

  function publish() {
    window.CSVB_DASHBOARD_MARINE_AREA_STABILIZER = {
      build: BUILD,
      mode: "passive-plus-soft-retirement",
      areaHomeGroups:
        window.CSVB_DASHBOARD_AREA_HOME?.config?.marine_applications_vessel_interaction?.groups?.map((g) => ({
          title: g.title,
          items: (g.items || []).map((i) => i.cardKey),
        })) || []
    };
  }

  function dashboardModuleAllows(moduleKey) {
    const access = window.CSVB_DASHBOARD_MODULE_ACCESS;
    if (!access) return false;
    if (access.isPlatform === true) return true;
    return access.enabled?.has?.(moduleKey) === true;
  }

  function cardAvailable(cardKey) {
    if (!cardKey || SOFT_RETIRED_CARD_KEYS.has(cardKey)) return false;

    if (cardKey === "sire_questions_viewer") {
      return dashboardModuleAllows("sire_questions_viewer") || dashboardModuleAllows("read_only_library");
    }

    const card = document.querySelector(`[data-card="${cardKey}"]`);
    if (!card) return false;
    return card.style.display !== "none";
  }

  function softRetireLegacyLibraryCard() {
    const legacy = document.querySelector('[data-card="library"]');
    if (legacy) {
      legacy.style.display = "none";
      legacy.setAttribute("data-csvb-soft-retired", "true");
    }
  }

  function patchAreaCounts() {
    const api = window.CSVB_DASHBOARD_PLATFORM_AREAS;
    const areas = Array.isArray(api?.areas) ? api.areas : [];
    const area = areas.find((x) => x?.key === "inspection_libraries_vetting");
    const countEl = document.querySelector('[data-platform-area-count="inspection_libraries_vetting"]');

    if (!area || !countEl) return;

    const count = (area.cards || []).reduce((total, cardKey) => {
      return total + (cardAvailable(cardKey) ? 1 : 0);
    }, 0);

    countEl.textContent = count === 1 ? "1 module" : `${count} modules`;
  }

  function runSoftRetirementPatch() {
    softRetireLegacyLibraryCard();
    patchAreaCounts();
  }

  function run() {
    publish();
    runSoftRetirementPatch();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  setTimeout(run, 350);
  setTimeout(run, 1000);
  setTimeout(run, 2500);
  setTimeout(run, 5000);

  const observer = new MutationObserver(() => {
    window.requestAnimationFrame(runSoftRetirementPatch);
  });

  if (document.body) {
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ["style", "class"]
    });
  } else {
    document.addEventListener("DOMContentLoaded", () => {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ["style", "class"]
      });
    });
  }
})();
