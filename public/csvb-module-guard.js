// public/csvb-module-guard.js
// C.S.V. BEACON — Direct Page Module Access Guard
// CP-8C: adds Company Policy module guard mapping.
// DASH-1: normalises/creates Dashboard navigation on module pages.

(() => {
  "use strict";

  const BUILD = "PLA12-2026-05-22-DASHBOARD-BUTTON-GUARD";

  const CSVB_COMPANY_VIEW_ID_KEY = "csvb_superuser_company_view_id";
  const CSVB_COMPANY_VIEW_NAME_KEY = "csvb_superuser_company_view_name";
  const DASHBOARD_PATH = "./q-dashboard.html";

  const PAGE_MODULE_MAP = {
    "library.html": "read_only_library",
    "q-sire-questions-viewer.html": "sire_questions_viewer",
    "risq-questions-viewer.html": "risq_questions_viewer",

    "q-dashboard.html": null,
    "index.html": null,
    "login.html": null,

    "q-vessel.html": "self_assessment",
    "q-answer.html": "self_assessment",
    "sa_tasks.html": "self_assessment",
    "sa_assignments.html": "self_assessment",
    "q-company.html": "self_assessment",

    "sa_compare.html": "post_inspection_stats",

    "post_inspection.html": "post_inspection",
    "post_inspection_detail.html": "post_inspection",
    "post_inspection_observation_detail.html": "post_inspection",

    "post_inspection_stats.html": "post_inspection_stats",
    "post_inspection_kpis.html": "post_inspection_stats",

    "inspector_intelligence.html": "inspector_intelligence",
    "audit_observations.html": "audit_observations",

    "q-report.html": "fleet_reports",

    "q-inspector.html": "sire_2_vetting",

    "q-questions-editor.html": "questions_editor",
    "risq-questions-editor.html": "risq_questions_editor",
    "q-company-overrides.html": "questions_editor",

    "threads.html": "threads",

    "company_policy.html": "company_policy",

    "mooring-anchoring-inventories-v4.html": "mooring_anchoring_inventories",
    "mooring-anchoring-component.html": "mooring_anchoring_inventories",
    "mooring-anchoring-operations.html": "mooring_anchoring_inventories",

    "portable-lifting-appliances-wires.html": "portable_lifting_appliances_wires",
    "portable-lifting-appliances-wire-component.html": "portable_lifting_appliances_wires",

    "su-admin.html": "platform_administration"
  };

  function currentPageName() {
    const p = String(window.location.pathname || "");
    return p.split("/").pop() || "index.html";
  }

  function shouldSkipDashboardButton() {
    const page = currentPageName().toLowerCase();
    return page === "q-dashboard.html" ||
      page === "login.html" ||
      page === "index.html" ||
      page === "";
  }

  function goDashboard() {
    window.location.href = DASHBOARD_PATH;
  }

  function dashboardElementScore(node) {
    if (!node) return 0;

    const id = String(node.id || "").toLowerCase();
    const text = String(node.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
    const href = String(node.getAttribute?.("href") || "").toLowerCase();
    const title = String(node.getAttribute?.("title") || "").toLowerCase();

    if (id === "dashboardbtn" || id === "dashboardbutton" || id === "csvbdashboardbtn") return 100;
    if (href.includes("q-dashboard.html")) return 95;
    if (text === "dashboard" || text === "⌂ dashboard" || text === "⌂ dashboard") return 90;
    if (text.includes("dashboard")) return 80;
    if (title.includes("dashboard")) return 70;
    return 0;
  }

  function normaliseDashboardButton(btn) {
    if (!btn) return;

    btn.classList.add("csvb-dashboard-btn");
    if (!btn.id) btn.id = "dashboardBtn";
    btn.setAttribute("title", "Go to Dashboard");

    if (!String(btn.textContent || "").trim()) {
      btn.textContent = "⌂ Dashboard";
    }

    if (btn.tagName === "A") {
      btn.setAttribute("href", DASHBOARD_PATH);
    } else {
      btn.setAttribute("type", "button");
      btn.onclick = goDashboard;
    }
  }

  function findDashboardActionContainer() {
    const topbar = document.querySelector(
      ".topbar, header.topbar, .csvb-pi-topbar, .csvb-topbar, .pi-hero, header"
    );

    if (!topbar) return null;

    return topbar.querySelector(
      ".topbar-right, .top-actions, .csvb-pi-actions, .header-actions, .nav-actions, .row"
    ) || topbar;
  }

  function createDashboardButton() {
    const btn = document.createElement("button");
    btn.id = "dashboardBtn";
    btn.type = "button";
    btn.className = "btn light csvb-dashboard-btn";
    btn.title = "Go to Dashboard";
    btn.textContent = "⌂ Dashboard";
    btn.onclick = goDashboard;
    return btn;
  }

  function ensureDashboardButton() {
    if (shouldSkipDashboardButton()) return null;
    if (!document.body) return null;

    const existing = Array.from(document.querySelectorAll("a, button"))
      .map((node) => ({ node, score: dashboardElementScore(node) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)[0]?.node || null;

    if (existing) {
      normaliseDashboardButton(existing);
      return existing;
    }

    const container = findDashboardActionContainer();
    if (!container) return null;

    const btn = createDashboardButton();

    const before = Array.from(container.children || []).find((child) => {
      const text = String(child.textContent || "").replace(/\s+/g, " ").trim().toLowerCase();
      return text.includes("mode selection") || text.includes("logout");
    });

    if (before) container.insertBefore(btn, before);
    else container.appendChild(btn);

    return btn;
  }

  function bootDashboardButton() {
    ensureDashboardButton();
    setTimeout(ensureDashboardButton, 250);
    setTimeout(ensureDashboardButton, 1000);
    setTimeout(ensureDashboardButton, 2500);
  }

  function redirectLegacyLibraryStudyRoute() {
    const page = currentPageName();
    if (page !== "library.html") return false;

    try {
      const params = new URLSearchParams(window.location.search || "");
      const mode = String(params.get("mode") || "").trim().toLowerCase();

      if (mode === "study" || mode === "readonly" || mode === "read-only") {
        window.location.replace("./q-sire-questions-viewer.html");
        return true;
      }
    } catch (_) {}

    return false;
  }

  function getSimulatedCompanyId() {
    return localStorage.getItem(CSVB_COMPANY_VIEW_ID_KEY) || "";
  }

  function getSimulatedCompanyName() {
    return localStorage.getItem(CSVB_COMPANY_VIEW_NAME_KEY) || "";
  }

  function showAccessDenied(message) {
    let box =
      document.getElementById("warnBox") ||
      document.getElementById("errBox") ||
      document.getElementById("loginError");

    if (!box) {
      box = document.createElement("div");
      box.id = "csvbModuleGuardWarn";
      box.style.margin = "16px";
      box.style.padding = "12px 14px";
      box.style.borderRadius = "12px";
      box.style.border = "1px solid #F5C2C2";
      box.style.background = "#FFF4F4";
      box.style.color = "#8B1D1D";
      box.style.fontWeight = "850";
      document.body.prepend(box);
    }

    box.textContent = message;
    box.style.display = "block";
  }

  function isPlatformRole(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function onboardAccessBlockReason(profile) {
    if (!profile || profile.role !== "vessel") return "";

    if (profile.onboard_access_enabled === false) {
      return "Access denied. Your onboard application access is currently disabled.";
    }

    if (profile.onboard_status === "inactive") {
      return "Access denied. Your onboard personnel status is inactive.";
    }

    if (
      profile.onboard_status === "disembarked" &&
      profile.read_only_after_disembarkation !== true
    ) {
      return "Access denied. Your onboard assignment is disembarked and read-only access is not enabled.";
    }

    return "";
  }

  function onboardReadOnlyMode(profile) {
    return !!(
      profile &&
      profile.role === "vessel" &&
      profile.onboard_status === "disembarked" &&
      profile.read_only_after_disembarkation === true
    );
  }

  function moduleKeyAlternates(moduleKey) {
    return [moduleKey];
  }

  function moduleKeyToAppModuleCode(moduleKey) {
    const map = {
      read_only_library: "QUESTION_LIBRARY",
      sire_questions_viewer: "SIRE_QUESTIONS_VIEWER",
      risq_questions_viewer: "RISQ_QUESTIONS_VIEWER",
      self_assessment: "VESSEL_QUESTIONNAIRES",
      post_inspection: "POST_INSPECTION",
      post_inspection_stats: "POST_INSPECTION_STATS",
      inspector_intelligence: "INSPECTOR_INTELLIGENCE",
      audit_observations: "AUDIT_OBSERVATIONS",
      fleet_reports: "REPORTS",
      sire_2_vetting: "INSPECTOR_THIRD_PARTY",
      questions_editor: "QUESTIONS_EDITOR",
      risq_questions_editor: "RISQ_QUESTIONS_EDITOR",
      threads: "THREADS",
      company_policy: "COMPANY_POLICY",
      mooring_anchoring_inventories: "MOORING_ANCHORING_INVENTORIES",
      portable_lifting_appliances_wires: "PORTABLE_LIFTING_APPLIANCES_WIRES",
      platform_administration: "SU_ADMIN"
    };

    return map[moduleKey] || "";
  }

  function moduleKeyToAppModuleCodes(moduleKey) {
    const primary = moduleKeyToAppModuleCode(moduleKey);
    return Array.from(new Set(primary ? [primary] : []));
  }

  async function rankAllowsModuleView(sb, moduleKey) {
    const appModuleCodes = moduleKeyToAppModuleCodes(moduleKey);
    const appModuleCode = appModuleCodes[0] || "";

    if (!appModuleCodes.length) {
      return { allowed: false, appModuleCode: "", appModuleCodes: [], rows: [] };
    }

    try {
      const { data, error } = await sb.rpc("csvb_my_effective_app_permissions");

      if (error) {
        console.warn("Rank-based module guard check failed:", error);
        return { allowed: false, appModuleCode, appModuleCodes, rows: [], error };
      }

      const rows = data || [];

      const allowed = rows.some((row) => {
        return appModuleCodes.includes(row.module_code) &&
          row.permission_action === "view" &&
          row.is_granted === true;
      });

      return { allowed, appModuleCode, appModuleCodes, rows };
    } catch (error) {
      console.warn("Rank-based module guard exception:", error);
      return { allowed: false, appModuleCode, appModuleCodes, rows: [], error };
    }
  }

  async function simulatedCompanyAllowsModule(sb, companyId, moduleKey) {
    const keys = moduleKeyAlternates(moduleKey);

    const { data, error } = await sb.rpc("csvb_admin_list_company_modules", {
      p_company_id: companyId
    });

    if (error) {
      throw new Error("Could not verify simulated company module access: " + error.message);
    }

    return (data || []).some((m) => keys.includes(m.module_key) && m.is_enabled === true);
  }

  async function guardPage() {
    ensureDashboardButton();

    if (redirectLegacyLibraryStudyRoute()) return;

    const page = currentPageName();
    const moduleKey = PAGE_MODULE_MAP[page];
    const moduleKeys = moduleKeyAlternates(moduleKey);
    const appModuleCodes = moduleKeyToAppModuleCodes(moduleKey);
    const appModuleCode = appModuleCodes[0] || "";

    window.CSVB_MODULE_GUARD_BUILD = BUILD;

    if (!moduleKey) return;

    if (!window.AUTH?.ensureSupabase || !window.AUTH?.getSessionUserProfile) {
      console.warn("C.S.V. BEACON module guard: AUTH is not available.");
      return;
    }

    const bundle = await window.AUTH.getSessionUserProfile();

    if (!bundle?.session?.user) return;

    const role = bundle?.profile?.role;
    const sb = window.AUTH.ensureSupabase();

    const onboardBlockReason = onboardAccessBlockReason(bundle?.profile);

    if (onboardBlockReason) {
      window.CSVB_MODULE_GUARD = {
        page,
        moduleKey,
        moduleKeys,
        appModuleCode,
        appModuleCodes,
        allowed: false,
        onboardBlocked: true,
        reason: onboardBlockReason
      };

      showAccessDenied(onboardBlockReason + " Redirecting to Dashboard…");

      setTimeout(() => {
        window.location.href = DASHBOARD_PATH;
      }, 1000);

      return;
    }

    if (onboardReadOnlyMode(bundle?.profile)) {
      window.CSVB_READ_ONLY_ACCESS = true;
    }

    if (isPlatformRole(role)) {
      const simulatedCompanyId = getSimulatedCompanyId();

      if (!simulatedCompanyId) {
        window.CSVB_MODULE_GUARD = {
          page,
          moduleKey,
          moduleKeys,
          appModuleCode,
          appModuleCodes,
          allowed: true,
          platformSimulation: false
        };
        ensureDashboardButton();
        return;
      }

      const allowedBySimulation = await simulatedCompanyAllowsModule(sb, simulatedCompanyId, moduleKey);

      window.CSVB_MODULE_GUARD = {
        page,
        moduleKey,
        moduleKeys,
        appModuleCode,
        appModuleCodes,
        allowed: allowedBySimulation,
        simulatedCompanyId,
        simulatedCompanyName: getSimulatedCompanyName(),
        platformSimulation: true
      };

      if (allowedBySimulation) {
        ensureDashboardButton();
        return;
      }

      showAccessDenied(
        "Access denied by simulated company context. Module is not enabled for " +
        (getSimulatedCompanyName() || "the selected company") +
        ": " + moduleKey + ". Redirecting to Dashboard…"
      );

      setTimeout(() => {
        window.location.href = DASHBOARD_PATH;
      }, 1000);

      return;
    }

    let companyModules = [];
    let companyAllowed = false;
    let companyError = null;

    try {
      const { data, error } = await sb.rpc("csvb_my_company_modules");

      if (error) {
        companyError = error;
      } else {
        companyModules = data || [];
        companyAllowed = companyModules.some((m) => {
          return moduleKeys.includes(m.module_key) && m.is_enabled === true;
        });
      }
    } catch (error) {
      companyError = error;
    }

    const rankCheck = await rankAllowsModuleView(sb, moduleKey);
    const rankAllowed = rankCheck.allowed === true;

    // Normal company users require BOTH company-level module enablement and
    // role/position permission. Company module enablement is tenant scope;
    // rank permission is the user's functional access right.
    const allowed = companyAllowed === true && rankAllowed === true;

    window.CSVB_MODULE_GUARD = {
      page,
      moduleKey,
      moduleKeys,
      appModuleCode: rankCheck.appModuleCode || appModuleCode,
      appModuleCodes: rankCheck.appModuleCodes?.length ? rankCheck.appModuleCodes : appModuleCodes,
      allowed,
      companyAllowed,
      rankAllowed,
      companyError: companyError ? String(companyError?.message || companyError) : null,
      modules: companyModules,
      effectivePermissionRows: rankCheck.rows || []
    };

    if (allowed) {
      ensureDashboardButton();
      return;
    }

    const deniedParts = [];
    if (!companyAllowed) deniedParts.push("the module is not enabled for your company");
    if (!rankAllowed) deniedParts.push("your role/position does not have view permission");

    showAccessDenied(
      "Access denied. " +
      (deniedParts.length ? deniedParts.join(" and ") : "This module is not available") +
      ": " + moduleKey + ". Redirecting to Dashboard…"
    );

    setTimeout(() => {
      window.location.href = DASHBOARD_PATH;
    }, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      bootDashboardButton();
      guardPage().catch((e) => {
        console.error("C.S.V. BEACON module guard error:", e);
        showAccessDenied(String(e?.message || e));
      });
    });
  } else {
    bootDashboardButton();
    guardPage().catch((e) => {
      console.error("C.S.V. BEACON module guard error:", e);
      showAccessDenied(String(e?.message || e));
    });
  }
})();