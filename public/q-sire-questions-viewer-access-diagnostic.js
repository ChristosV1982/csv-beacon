// public/q-sire-questions-viewer-access-diagnostic.js
// C.S.V. BEACON — SIRE Viewer access diagnostic helper
// Console-only diagnostic. No UI changes. No backend calls except reading current session/profile through AUTH.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-ACCESS-DIAGNOSTIC-20260519_2";
  window.CSVB_SIRE_VIEWER_ACCESS_DIAGNOSTIC_BUILD = BUILD;

  function safeStr(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function visibleById(id) {
    const el = document.getElementById(id);
    if (!el) return false;
    const style = window.getComputedStyle(el);
    return style.display !== "none" && style.visibility !== "hidden" && style.opacity !== "0";
  }

  function allowedAiRoles(role) {
    return ["super_admin", "platform_owner", "company_admin", "company_superintendent"].includes(role);
  }

  function platformRoles(role) {
    return ["super_admin", "platform_owner"].includes(role);
  }

  function buildDiagnostic(profile) {
    const role = safeStr(profile?.role || "");
    const username = safeStr(profile?.username || "");
    const companyId = safeStr(profile?.company_id || "");

    const expected = {
      ai_search_visible: allowedAiRoles(role),
      ai_usage_log_visible: platformRoles(role),
      changes_log_visible: platformRoles(role),
    };

    const actual = {
      ai_search_visible: visibleById("csvbAiSourceLauncher"),
      ai_usage_log_visible: visibleById("csvbAiUsageLogTrigger"),
      changes_log_visible: visibleById("csvbSireViewerChangeLogTrigger"),
      readonly_pill_visible: !!document.querySelector(".csvb-sire-viewer-helper-badge"),
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

    const me = await window.AUTH.getSessionUserProfile();
    const report = buildDiagnostic(me?.profile || {});

    if (report.pass) {
      console.log("C.S.V. BEACON: SIRE Viewer access diagnostic PASS", report);
    } else {
      console.warn("C.S.V. BEACON: SIRE Viewer access diagnostic WARN", report);
    }

    return report;
  }

  window.CSVB_SIRE_VIEWER_ACCESS_DIAGNOSTIC = {
    build: BUILD,
    run,
  };
})();
