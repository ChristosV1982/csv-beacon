// public/company_policy_permissions.js
// C.S.V. BEACON – Company Policy fine-grained permission enforcement
// CP-8D: hides/disables tabs and controls based on Rights Matrix grants.

(() => {
  "use strict";

  const BUILD = "CP8D-2026-05-07";

  const STATE = {
    loaded: false,
    rows: [],
    flags: {},
    observer: null,
  };

  function showWarn(message) {
    const el = document.getElementById("warnBox");
    if (!el) return;
    el.textContent = message || "";
    el.style.display = message ? "block" : "none";
  }

  function isPlatformRole() {
    const role =
      window.CSVB_CONTEXT?.profile?.role ||
      window.CSVB_CONTEXT?.role ||
      "";
    return role === "super_admin" || role === "platform_owner";
  }

  function sb() {
    if (!window.AUTH?.ensureSupabase) {
      throw new Error("AUTH helper is not available.");
    }
    return window.AUTH.ensureSupabase();
  }

  function key(moduleCode, action) {
    return `${moduleCode}.${action}`;
  }

  function has(moduleCode, action) {
    if (isPlatformRole()) return true;
    return STATE.flags[key(moduleCode, action)] === true;
  }

  function setVisible(el, visible) {
    if (!el) return;
    el.style.display = visible ? "" : "none";
    el.setAttribute("data-csvb-policy-permission-hidden", visible ? "0" : "1");
  }

  function setEnabled(el, enabled) {
    if (!el) return;
    el.disabled = !enabled;
    el.setAttribute("data-csvb-policy-permission-disabled", enabled ? "0" : "1");
  }

  function hideClosest(el, selector) {
    if (!el) return;
    const host = el.closest(selector);
    if (host) setVisible(host, false);
  }

  function disableButton(id, allowed) {
    const el = document.getElementById(id);
    if (el) setEnabled(el, allowed);
  }

  function hideTab(tabName, visible) {
    const btn = document.querySelector(`[data-tab="${tabName}"]`);
    const panel = document.getElementById(`tab-${tabName}`);

    setVisible(btn, visible);

    if (!visible && btn?.classList.contains("active")) {
      const fallback =
        document.querySelector('[data-tab="policyBook"]') ||
        document.querySelector(".tab-btn");
      if (fallback) fallback.click();
    }

    if (!visible && panel) {
      panel.classList.add("hidden");
    }
  }

  function hideContentTab(tabName, visible) {
    const btn = document.querySelector(`[data-content-tab="${tabName}"]`);
    const panel = document.getElementById(`contentTab-${tabName}`);

    setVisible(btn, visible);

    if (!visible && btn?.classList.contains("active")) {
      const fallback =
        document.querySelector('[data-content-tab="published"]') ||
        document.querySelector(".content-tab-btn");
      if (fallback) fallback.click();
    }

    if (!visible && panel) {
      panel.classList.add("hidden");
    }
  }

  function buildFlags(rows) {
    const out = {};

    (rows || []).forEach((row) => {
      out[String(row.perm_key || "")] = row.allowed === true;
    });

    STATE.flags = out;
  }

  async function loadPermissions() {
    if (window.AUTH?.getSessionUserProfile) {
      await window.AUTH.getSessionUserProfile();
    }

    const { data, error } = await sb().rpc("csvb_company_policy_my_permissions");

    if (error) {
      throw new Error("Could not load Company Policy permissions: " + error.message);
    }

    STATE.rows = data || [];
    buildFlags(STATE.rows);
    STATE.loaded = true;

    window.CSVB_COMPANY_POLICY_PERMISSIONS = {
      build: BUILD,
      rows: STATE.rows,
      flags: STATE.flags,
      has,
    };
  }

  function applyPermissions() {
    if (!STATE.loaded) return;

    const canPolicyView = has("COMPANY_POLICY", "view");
    const canPolicyEdit = has("COMPANY_POLICY", "edit");
    const canPolicyAdmin = has("COMPANY_POLICY", "admin");

    const canAiSearch = has("COMPANY_POLICY_AI_SEARCH", "view");

    const canCrView = has("COMPANY_POLICY_CHANGE_REQUESTS", "view");
    const canCrSubmit = has("COMPANY_POLICY_CHANGE_REQUESTS", "edit");
    const canCrAdmin = has("COMPANY_POLICY_CHANGE_REQUESTS", "admin");

    const canDocsView = has("COMPANY_POLICY_DOCUMENTS", "view");
    const canDocsEdit =
      has("COMPANY_POLICY_DOCUMENTS", "edit") ||
      has("COMPANY_POLICY_DOCUMENTS", "admin");

    // Main tabs
    hideTab("policyBook", canPolicyView);
    hideTab("search", canPolicyView);
    hideTab("aiSearch", canAiSearch);
    hideTab("changeRequests", canCrView || canCrSubmit);
    hideTab("manuals", canDocsView);
    hideTab("adminSetup", canPolicyAdmin);

    // Main policy book actions
    disableButton("submitChangeRequestBtn", canCrSubmit);
    disableButton("editDraftBtn", canPolicyEdit || canPolicyAdmin);

    // Policy content subtabs
    hideContentTab("draft", canPolicyEdit || canPolicyAdmin);
    hideContentTab("history", canPolicyAdmin);

    // Draft / publish controls
    [
      "saveDraftBtn",
      "submitDraftBtn",
      "approveVersionBtn",
      "publishVersionBtn",
      "rejectVersionBtn",
      "discardWorkVersionBtn",
      "reloadEditorBtn",
    ].forEach((id) => {
      disableButton(id, canPolicyEdit || canPolicyAdmin);
    });

    // Admin / structure controls
    setVisible(document.getElementById("adminTools"), canPolicyAdmin);
    setVisible(document.getElementById("adminDeniedBox"), !canPolicyAdmin);

    // Change Request submit controls
    const crSubmit = document.getElementById("crSubmitBtn");
    if (crSubmit) {
      setEnabled(crSubmit, canCrSubmit);
      if (!canCrSubmit) {
        hideClosest(crSubmit, ".cr-card");
      }
    }

    // Change Request admin controls and implementation helpers
    [
      "crSetStatusBtn",
      "crNewStatus",
      "crStatusNote",
      "crOpenPolicyItemBtn",
      "crCopyRequestedBtn",
      "crCopyProposedBtn",
      "crLoadProposedToEditorBtn",
      "crLinkWorkVersionBtn",
    ].forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;

      if (!canCrAdmin) {
        const section = el.closest(".cr-detail-section");
        if (section) setVisible(section, false);
      } else {
        setVisible(el, true);
        setEnabled(el, true);
      }
    });

    // Documents admin controls
    setVisible(document.getElementById("docsAdminFolderTools"), canDocsEdit);
    setVisible(document.getElementById("docsAdminUploadTools"), canDocsEdit);

    document.querySelectorAll("[data-archive-doc]").forEach((btn) => {
      setVisible(btn, canDocsEdit);
      setEnabled(btn, canDocsEdit);
    });

    // AI controls
    disableButton("policyAiRunBtn", canAiSearch);
    disableButton("policyAiCopyAnswerBtn", canAiSearch);
  }

  function startObserver() {
    if (STATE.observer) return;

    STATE.observer = new MutationObserver(() => {
      window.requestAnimationFrame(applyPermissions);
    });

    STATE.observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }

  async function init() {
    try {
      await loadPermissions();
      applyPermissions();
      startObserver();
    } catch (error) {
      showWarn(String(error?.message || error));
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    setTimeout(init, 0);
  }
})();