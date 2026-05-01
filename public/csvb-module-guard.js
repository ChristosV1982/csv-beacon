// public/csvb-module-guard.js
// C.S.V. BEACON — Direct Page Module Access Guard
// MC-8B: respects superuser simulated company context.

(() => {
  "use strict";

  const BUILD = "MC8B-2026-04-30";

  const CSVB_COMPANY_VIEW_ID_KEY = "csvb_superuser_company_view_id";
  const CSVB_COMPANY_VIEW_NAME_KEY = "csvb_superuser_company_view_name";

  const PAGE_MODULE_MAP = {
    "library.html": "read_only_library",

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
    "q-company-overrides.html": "questions_editor",
    "threads.html": "threads",

    "su-admin.html": "platform_administration"
  };

  function currentPageName() {
    const p = String(window.location.pathname || "");
    return p.split("/").pop() || "index.html";
  }

  function getSimulatedCompanyId(){
    return localStorage.getItem(CSVB_COMPANY_VIEW_ID_KEY) || "";
  }

  function getSimulatedCompanyName(){
    return localStorage.getItem(CSVB_COMPANY_VIEW_NAME_KEY) || "";
  }

  function showAccessDenied(message) {
    let box = document.getElementById("warnBox") || document.getElementById("errBox") || document.getElementById("loginError");

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

  async function simulatedCompanyAllowsModule(sb, companyId, moduleKey) {
    const { data, error } = await sb.rpc("csvb_admin_list_company_modules", {
      p_company_id: companyId
    });

    if (error) {
      throw new Error("Could not verify simulated company module access: " + error.message);
    }

    return (data || []).some((m) => m.module_key === moduleKey && m.is_enabled === true);
  }

  async function guardPage() {
    const page = currentPageName();
    const moduleKey = PAGE_MODULE_MAP[page];

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

    if (isPlatformRole(role)) {
      const simulatedCompanyId = getSimulatedCompanyId();

      if (!simulatedCompanyId) return;

      const allowedBySimulation = await simulatedCompanyAllowsModule(sb, simulatedCompanyId, moduleKey);

      window.CSVB_MODULE_GUARD = {
        page,
        moduleKey,
        allowed: allowedBySimulation,
        simulatedCompanyId,
        simulatedCompanyName: getSimulatedCompanyName(),
        platformSimulation: true
      };

      if (allowedBySimulation) return;

      showAccessDenied(
        "Access denied by simulated company context. Module is not enabled for " +
        (getSimulatedCompanyName() || "the selected company") +
        ": " + moduleKey + ". Redirecting to Dashboard…"
      );

      setTimeout(() => {
        window.location.href = "./q-dashboard.html";
      }, 1000);

      return;
    }

    const { data, error } = await sb.rpc("csvb_my_company_modules");

    if (error) {
      throw new Error("Could not verify module access: " + error.message);
    }

    const allowed = (data || []).some((m) => {
      return m.module_key === moduleKey && m.is_enabled === true;
    });

    window.CSVB_MODULE_GUARD = {
      page,
      moduleKey,
      allowed,
      modules: data || []
    };

    if (allowed) return;

    showAccessDenied(
      "Access denied. This module is not enabled for your company: " + moduleKey + ". Redirecting to Dashboard…"
    );

    setTimeout(() => {
      window.location.href = "./q-dashboard.html";
    }, 1000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      guardPage().catch((e) => {
        console.error("C.S.V. BEACON module guard error:", e);
        showAccessDenied(String(e?.message || e));
      });
    });
  } else {
    guardPage().catch((e) => {
      console.error("C.S.V. BEACON module guard error:", e);
      showAccessDenied(String(e?.message || e));
    });
  }
})();
