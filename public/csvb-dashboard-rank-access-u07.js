/* public/csvb-dashboard-rank-access-u07.js */
/* C.S.V. BEACON – U-07 Dashboard Rank-Based Permission Filter */

(() => {
  "use strict";

  const BUILD = "CSVBEACON-DASHBOARD-RANK-ACCESS-PLA03B-20260512-1";

  const CARD_TO_APP_MODULE_CODE = {
    library: "QUESTION_LIBRARY",
    compare: "PRE_POST_COMPARE",
    vessel: "VESSEL_QUESTIONNAIRES",
    tasks: "SELF_ASSESSMENT_TASKS",
    company: "COMPANY_BUILDER",
    assignments: "SELF_ASSESSMENT_ASSIGNMENTS",
    post: "POST_INSPECTION",
    poststats: "POST_INSPECTION_STATS",
    inspector_intelligence: "INSPECTOR_INTELLIGENCE",
    audit_observations: "AUDIT_OBSERVATIONS",
    reports: "REPORTS",
    inspector: "INSPECTOR_THIRD_PARTY",
    qeditor: "QUESTIONS_EDITOR",
    threads: "THREADS",
    company_policy: "COMPANY_POLICY",
    mooring_anchoring_inventories: "MOORING_ANCHORING_INVENTORIES",
    portable_lifting_appliances_wires: "PORTABLE_LIFTING_APPLIANCES_WIRES",
    suadmin: "SU_ADMIN"
  };

  function warn(message) {
    const box = document.getElementById("warnBox");
    if (!box) return;

    box.textContent = message || "";
    box.style.display = message ? "block" : "none";
  }

  function isPlatformRole(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function onboardBlockReason(profile) {
    if (!profile || profile.role !== "vessel") return "";

    if (profile.onboard_access_enabled === false) {
      return "Your onboard application access is currently disabled.";
    }

    if (profile.onboard_status === "inactive") {
      return "Your onboard personnel status is inactive.";
    }

    if (
      profile.onboard_status === "disembarked" &&
      profile.read_only_after_disembarkation !== true
    ) {
      return "Your onboard assignment is disembarked and read-only access is not enabled.";
    }

    return "";
  }

  function hideAllNonPublicCards() {
    document.querySelectorAll("[data-card]").forEach((card) => {
      const key = card.getAttribute("data-card");
      const keep = key === "library" || key === "compare";
      card.style.display = keep ? "block" : "none";
    });
  }

  function applyPermissionFilter(allowedViewModules) {
    document.querySelectorAll("[data-card]").forEach((card) => {
      const key = card.getAttribute("data-card");
      const moduleCode = CARD_TO_APP_MODULE_CODE[key];

      if (!moduleCode) return;

      if (!allowedViewModules.has(moduleCode)) {
        card.style.display = "none";
      }
    });
  }

  async function run() {
    window.CSVB_DASHBOARD_RANK_ACCESS_BUILD = BUILD;

    if (!window.AUTH?.getSessionUserProfile) return;

    const bundle = await window.AUTH.getSessionUserProfile();

    if (!bundle?.session?.user || !bundle.profile) return;

    const profile = bundle.profile;
    const block = onboardBlockReason(profile);

    if (block) {
      hideAllNonPublicCards();
      warn(block);
      window.CSVB_DASHBOARD_RANK_ACCESS = {
        blocked: true,
        reason: block,
        profile
      };
      return;
    }

    if (isPlatformRole(profile.role)) {
      window.CSVB_DASHBOARD_RANK_ACCESS = {
        skipped: true,
        reason: "platform role"
      };
      return;
    }

    const sb = window.AUTH.ensureSupabase();

    const { data, error } = await sb.rpc("csvb_my_effective_app_permissions");

    if (error) {
      console.warn("Dashboard rank permission filter failed:", error);
      window.CSVB_DASHBOARD_RANK_ACCESS = {
        error: error.message || String(error)
      };
      return;
    }

    const allowedViewModules = new Set(
      (data || [])
        .filter((row) => row.permission_action === "view" && row.is_granted === true)
        .map((row) => row.module_code)
    );

    applyPermissionFilter(allowedViewModules);

    window.CSVB_DASHBOARD_RANK_ACCESS = {
      allowedViewModules: Array.from(allowedViewModules),
      rows: data || [],
      profile
    };

    if (
      profile.role === "vessel" &&
      profile.onboard_status === "disembarked" &&
      profile.read_only_after_disembarkation === true
    ) {
      window.CSVB_READ_ONLY_ACCESS = true;
      warn("Read-only access: your onboard assignment is marked as disembarked.");
    }
  }

  function start() {
    window.setTimeout(() => run().catch(console.error), 900);
    window.setTimeout(() => run().catch(console.error), 1800);
    window.setTimeout(() => run().catch(console.error), 3200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
