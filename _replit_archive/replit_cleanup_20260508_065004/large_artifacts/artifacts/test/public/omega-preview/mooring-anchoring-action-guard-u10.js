/* public/mooring-anchoring-action-guard-u10.js */
/* C.S.V. BEACON – U-10 MAI action-level UI guard */

(() => {
  "use strict";

  const BUILD = "MAI-ACTION-GUARD-U10-20260512-1";

  const EDIT_ACTION_BUTTON_IDS = new Set([
    "registerComponentBtn",
    "recordOperationBtn",
    "recordOperationSubmitBtn",
    "selectAllComponentsBtn",
    "saveFieldsBtn",
    "recordInitialHoursBtn",
    "recordLifecycleEventBtn",
    "startChecklistBtn",
    "saveChecklistAnswersBtn",
    "completeChecklistRunBtn"
  ]);

  const OFFICE_ONLY_BUTTON_IDS = new Set([
    "completeLockBtn",
    "lockBtn",
    "unlockBtn"
  ]);

  function toast(type, message) {
    if (window.CSVBToast?.show) {
      window.CSVBToast.show(type, message);
      return;
    }

    const box =
      type === "ok"
        ? document.getElementById("okBox")
        : document.getElementById("warnBox");

    if (box) {
      box.textContent = message || "";
      box.style.display = message ? "block" : "none";
      return;
    }

    if (message) alert(message);
  }

  function hideButton(id, hidden) {
    const btn = document.getElementById(id);
    if (!btn) return;

    btn.disabled = hidden;
    btn.style.display = hidden ? "none" : "";
  }

  function disableInputsInside(selector, disabled) {
    const host = document.querySelector(selector);
    if (!host) return;

    host.querySelectorAll("input, select, textarea, button").forEach((el) => {
      if (disabled) {
        el.disabled = true;
      }
    });
  }

  function ensureReadOnlyBanner(perms) {
    if (!perms.canView) return;

    const existing = document.getElementById("maiPermissionBannerU10");
    const needsBanner = !perms.canEdit || perms.isReadOnly;

    if (!needsBanner) {
      existing?.remove();
      return;
    }

    if (existing) return;

    const banner = document.createElement("div");
    banner.id = "maiPermissionBannerU10";
    banner.style.margin = "8px 0";
    banner.style.padding = "10px 12px";
    banner.style.border = "1px solid #F6D58F";
    banner.style.borderLeft = "5px solid #F4A000";
    banner.style.borderRadius = "12px";
    banner.style.background = "#FFF6E0";
    banner.style.color = "#8A5A00";
    banner.style.fontWeight = "900";
    banner.textContent =
      "MAI read-only access: your rank/account can view this module, but cannot perform edit actions.";

    const target =
      document.querySelector("main") ||
      document.querySelector(".wrap") ||
      document.body;

    target.prepend(banner);
  }

  async function getPermissions() {
    if (!window.CSVB_MAI_PERMISSIONS?.whenReady) {
      return {
        canView: false,
        canEdit: false,
        canAdmin: false,
        isOffice: false,
        isReadOnly: true,
        reason: "MAI permission helper not loaded."
      };
    }

    return await window.CSVB_MAI_PERMISSIONS.whenReady();
  }

  function applyChecklistGuard(perms) {
    if (perms.canEdit) return;

    hideButton("startChecklistBtn", true);
    hideButton("saveChecklistAnswersBtn", true);
    hideButton("completeChecklistRunBtn", true);

    document.querySelectorAll("[data-mai-delete-draft-run]").forEach((btn) => {
      btn.disabled = true;
      btn.style.display = "none";
    });

    document.querySelectorAll(
      "[data-mai-answer-option], [data-mai-answer-remarks], #checklistFinalDecision, #checklistFinalRemarks"
    ).forEach((el) => {
      el.disabled = true;
    });
  }

  function applyGuard(perms) {
    window.CSVB_MAI_ACTION_GUARD = {
      build: BUILD,
      permissions: perms
    };

    ensureReadOnlyBanner(perms);

    EDIT_ACTION_BUTTON_IDS.forEach((id) => {
      hideButton(id, !perms.canEdit);
    });

    OFFICE_ONLY_BUTTON_IDS.forEach((id) => {
      hideButton(id, !perms.isOffice);
    });

    if (!perms.canEdit) {
      disableInputsInside("#dynamicFields", true);

      [
        "initialHours",
        "initialHoursDate",
        "initialHoursRemarks",
        "lifecycleEventType",
        "lifecycleEventDate",
        "lifecyclePerformedBy",
        "lifecycleRemarks"
      ].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
      });

      applyChecklistGuard(perms);
    }
  }

  function bindClickBlocker() {
    if (document.body.getAttribute("data-mai-u10-click-blocker") === "1") return;

    document.body.setAttribute("data-mai-u10-click-blocker", "1");

    document.addEventListener("click", async (event) => {
      const btn = event.target.closest("button");
      if (!btn) return;

      const id = btn.id || "";

      if (!EDIT_ACTION_BUTTON_IDS.has(id) && !OFFICE_ONLY_BUTTON_IDS.has(id)) return;

      const perms = await getPermissions();

      if (OFFICE_ONLY_BUTTON_IDS.has(id) && !perms.isOffice) {
        event.preventDefault();
        event.stopImmediatePropagation();
        toast("warn", "This action is restricted to Office / Platform users.");
        return;
      }

      if (EDIT_ACTION_BUTTON_IDS.has(id) && !perms.canEdit) {
        event.preventDefault();
        event.stopImmediatePropagation();
        toast("warn", "Your rank/account has MAI read-only access. Edit actions are not allowed.");
      }
    }, true);
  }

  async function run() {
    const perms = await getPermissions();
    applyGuard(perms);
    bindClickBlocker();
  }

  function start() {
    run().catch(console.error);

    window.addEventListener("csvb:mai-permissions-ready", (event) => {
      applyGuard(event.detail || window.CSVB_MAI_PERMISSIONS.get());
    });

    const observer = new MutationObserver(() => {
      run().catch(console.error);
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true
    });

    setTimeout(() => run().catch(console.error), 500);
    setTimeout(() => run().catch(console.error), 1500);
    setTimeout(() => run().catch(console.error), 3000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
