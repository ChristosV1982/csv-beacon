// public/risq-questions-viewer-access-diagnostic.js
// C.S.V. BEACON — RISQ Viewer access diagnostic helper
// Console-only diagnostic. No UI changes. No data writes.

(() => {
  "use strict";

  const BUILD = "RISQ-VIEWER-ACCESS-DIAGNOSTIC-20260520_2";
  window.CSVB_RISQ_VIEWER_ACCESS_DIAGNOSTIC_BUILD = BUILD;

  function safeStr(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function ensureCompactDetailLoaded() {
    if (window.CSVB_RISQ_COMPACT_DETAIL_BUILD) return;
    if (document.querySelector('script[data-csvb-risq-compact-detail-loader="1"]')) return;

    const script = document.createElement("script");
    script.src = "./risq-questions-compact-detail.js?v=20260520_1";
    script.defer = true;
    script.dataset.csvbRisqCompactDetailLoader = "1";
    document.body.appendChild(script);
  }

  function isElementVisible(el) {
    if (!el) return false;

    const style = window.getComputedStyle(el);
    if (style.display === "none" || style.visibility === "hidden" || style.opacity === "0") return false;

    const rects = el.getClientRects();
    if (rects && rects.length > 0) return true;

    return !!(el.offsetWidth || el.offsetHeight);
  }

  function visibleById(id) {
    return isElementVisible(document.getElementById(id));
  }

  function allowedAiRoles(role) {
    return ["super_admin", "platform_owner", "company_admin", "company_superintendent"].includes(role);
  }

  function platformRoles(role) {
    return ["super_admin", "platform_owner"].includes(role);
  }

  function directGuardReport() {
    const guard = window.CSVB_MODULE_GUARD || null;

    return {
      build: window.CSVB_MODULE_GUARD_BUILD || "",
      page: guard?.page || "",
      moduleKey: guard?.moduleKey || "",
      moduleKeys: Array.isArray(guard?.moduleKeys) ? guard.moduleKeys.slice() : [],
      appModuleCode: guard?.appModuleCode || "",
      appModuleCodes: Array.isArray(guard?.appModuleCodes) ? guard.appModuleCodes.slice() : [],
      companyAllowed: guard?.companyAllowed,
      rankAllowed: guard?.rankAllowed,
      allowed: guard?.allowed,
      platformSimulation: guard?.platformSimulation === true,
    };
  }

  function buildDiagnostic(profile) {
    const role = safeStr(profile?.role || "");
    const username = safeStr(profile?.username || "");
    const companyId = safeStr(profile?.company_id || "");
    const guard = directGuardReport();

    const expected = {
      page: "risq-questions-viewer.html",
      moduleKey: "risq_questions_viewer",
      appModuleCode: "RISQ_QUESTIONS_VIEWER",
      guard_allowed: true,
      ai_search_visible: allowedAiRoles(role),
      ai_usage_log_visible: false,
      changes_log_visible: false,
      no_editor_controls_visible: true,
      readonly_pill_visible: true,
      question_count_positive: true,
    };

    const rows = window.CSVB_RISQ_QUESTIONS_VIEWER?.getRows?.() || [];

    const actual = {
      page: guard.page || safeStr(location.pathname).split("/").pop(),
      moduleKey: guard.moduleKey,
      appModuleCode: guard.appModuleCode || guard.appModuleCodes?.[0] || "",
      guard_allowed: guard.allowed === true,
      ai_search_visible: visibleById("risqAiLauncher"),
      ai_usage_log_visible: visibleById("csvbAiUsageLogToggleBtn"),
      changes_log_visible: visibleById("csvbSireViewerChangeLogToggleBtn"),
      no_editor_controls_visible: isElementVisible(document.querySelector(".viewer-pill.lock")),
      readonly_pill_visible: isElementVisible(document.querySelector(".viewer-pill.readonly")),
      question_count_positive: Array.isArray(rows) && rows.length > 0,
      question_count: Array.isArray(rows) ? rows.length : null,
    };

    const warnings = [];

    for (const key of Object.keys(expected)) {
      if (expected[key] !== actual[key]) {
        warnings.push(`${key}: expected ${expected[key]}, actual ${actual[key]}`);
      }
    }

    return {
      build: BUILD,
      username,
      role,
      company_id: companyId,
      guard,
      expected,
      actual,
      pass: warnings.length === 0,
      warnings,
    };
  }

  async function run() {
    if (!window.AUTH?.getSessionUserProfile) {
      return {
        build: BUILD,
        pass: false,
        warnings: ["AUTH.getSessionUserProfile is not available."],
      };
    }

    // Give deferred helpers a short moment to settle after hard refresh.
    await new Promise((resolve) => setTimeout(resolve, 180));

    const me = await window.AUTH.getSessionUserProfile();
    const report = buildDiagnostic(me?.profile || {});

    if (report.pass) {
      console.log("C.S.V. BEACON: RISQ Viewer access diagnostic PASS", report);
    } else {
      console.warn("C.S.V. BEACON: RISQ Viewer access diagnostic WARN", report);
    }

    return report;
  }

  ensureCompactDetailLoaded();

  window.CSVB_RISQ_VIEWER_ACCESS_DIAGNOSTIC = {
    build: BUILD,
    run,
  };
})();
