/* public/mooring-anchoring-office-lock-guard-u09d.js */
/* C.S.V. BEACON – MAI Office-only component lock UI guard */

(() => {
  "use strict";

  const BUILD = "MAI-OFFICE-LOCK-GUARD-U09D-20261015-REQUEST-STORM-FIX-1";
  let profilePromise = null;

  function isOfficeRole(role) {
    return [
      "super_admin",
      "platform_owner",
      "company_admin",
      "company_superintendent"
    ].includes(role);
  }

  async function applyGuard() {
    if (!window.AUTH?.getSessionUserProfile) return;

    if (!profilePromise) {
      profilePromise = window.AUTH.getSessionUserProfile();
    }

    const bundle = await profilePromise;
    const role = bundle?.profile?.role || "";
    const isOffice = isOfficeRole(role);

    [
      "completeLockBtn",
      "lockBtn",
      "unlockBtn"
    ].forEach((id) => {
      const btn = document.getElementById(id);
      if (!btn) return;

      if (!isOffice) {
        btn.disabled = true;
        btn.style.display = "none";
      }
    });

    window.CSVB_MAI_OFFICE_LOCK_GUARD_BUILD = BUILD;
  }

  function start() {
    applyGuard().catch(console.error);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
