/* public/csvb-hide-apply-onboard-setup-u05c.js */
/* C.S.V. BEACON – U-05C remove temporary Apply Onboard Setup migration button */

(() => {
  "use strict";

  const BUILD = "CSVBEACON-U05C-HIDE-APPLY-ONBOARD-SETUP-20260512-1";

  function removeApplyOnboardSetupButtons() {
    document.querySelectorAll("button").forEach((btn) => {
      const text = String(btn.textContent || "").trim().toLowerCase();

      if (text === "apply onboard setup") {
        btn.remove();
      }
    });

    window.CSVB_HIDE_APPLY_ONBOARD_SETUP_U05C_BUILD = BUILD;
  }

  function start() {
    removeApplyOnboardSetupButtons();

    const observer = new MutationObserver(() => {
      removeApplyOnboardSetupButtons();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    window.setTimeout(removeApplyOnboardSetupButtons, 500);
    window.setTimeout(removeApplyOnboardSetupButtons, 1500);
    window.setTimeout(removeApplyOnboardSetupButtons, 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
