// public/csvb-module-guard.js
// C.S.V. BEACON — Direct Page Module Access Guard
// CP-8C: adds Company Policy module guard mapping.

(() => {
  "use strict";

  const BUILD = "U07B-2026-05-12-ONBOARD-MODULE-GUARD";

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

    "company_policy.html": "company_policy",

    "mooring-anchoring-inventories-v4.html": "mooring_anchoring_inventories",
    "mooring-anchoring-component.html": "mooring_anchoring_inventories",
    "mooring-anchoring-operations.html": "mooring_anchoring_inventories",

    "su-admin.html": "platform_administration"
  };

  function currentPageName() {
    const p = String(window.location.pathname || "");
    return p.split("/").pop() || "index.html";
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

    const onboardBlockReason = onboardAccessBlockReason(bundle?.profile);

    if (onboardBlockReason) {
      window.CSVB_MODULE_GUARD = {
        page,
        moduleKey,
        allowed: false,
        onboardBlocked: true,
        reason: onboardBlockReason
      };

      showAccessDenied(onboardBlockReason + " Redirecting to Dashboard…");

      setTimeout(() => {
        window.location.href = "./q-dashboard.html";
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
          allowed: true,
          platformSimulation: false
        };
        return;
      }

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