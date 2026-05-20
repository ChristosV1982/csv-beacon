// public/csvb-retire-read-only-library.js
// C.S.V. BEACON — Read-Only Library retirement helper
// Phase 1 soft-retirement: remove legacy dashboard card and rewrite old study links.

(() => {
  "use strict";

  const BUILD = "READ-ONLY-LIBRARY-RETIREMENT-20260519_1";
  window.CSVB_READ_ONLY_LIBRARY_RETIREMENT_BUILD = BUILD;

  const VIEWER_URL = "./q-sire-questions-viewer.html";

  function retireLegacyDashboardCard() {
    document.querySelectorAll('[data-card="library"]').forEach((card) => {
      card.remove();
    });
  }

  function rewriteLegacyStudyLinks() {
    document.querySelectorAll('a[href], button[onclick]').forEach((el) => {
      const href = el.getAttribute("href") || "";
      const onclick = el.getAttribute("onclick") || "";

      if (href.includes("library.html") && href.includes("mode=study")) {
        el.setAttribute("href", VIEWER_URL);
      }

      if (onclick.includes("library.html") && onclick.includes("mode=study")) {
        el.setAttribute("onclick", "location.href='./q-sire-questions-viewer.html'");
      }
    });
  }

  function removeLegacyModuleFlagFromDashboardAccess() {
    const access = window.CSVB_DASHBOARD_MODULE_ACCESS;
    if (!access?.enabled?.delete) return;
    access.enabled.delete("read_only_library");
  }

  function run() {
    retireLegacyDashboardCard();
    rewriteLegacyStudyLinks();
    removeLegacyModuleFlagFromDashboardAccess();
  }

  function boot() {
    run();
    setTimeout(run, 300);
    setTimeout(run, 900);
    setTimeout(run, 1800);

    window.CSVB_READ_ONLY_LIBRARY_RETIREMENT = {
      build: BUILD,
      run,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    setTimeout(boot, 0);
  }
})();
