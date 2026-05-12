/* public/mooring-anchoring-office-lock-guard-u09d.js */
/* C.S.V. BEACON – MAI Office-only component lock UI guard */

(() => {
  "use strict";

  const BUILD = "MAI-OFFICE-LOCK-GUARD-U09D-20260512-1";

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

    const bundle = await window.AUTH.getSessionUserProfile();
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
    setTimeout(() => applyGuard().catch(console.error), 600);
    setTimeout(() => applyGuard().catch(console.error), 1600);

    const observer = new MutationObserver(() => {
      applyGuard().catch(console.error);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
