// public/csvb-module-guard.js
// C.S.V. BEACON — MC-4C Direct Page Module Access Guard

(() => {
  "use strict";

  const BUILD = "MC4C-2026-04-29";

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

    "su-admin.html": "platform_administration"
  };

  function currentPageName() {
    const p = String(window.location.pathname || "");
    return p.split("/").pop() || "index.html";
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

  async function guardPage() {
    const page = currentPageName();
    const moduleKey = PAGE_MODULE_MAP[page];

    window.CSVB_MODULE_GUARD_BUILD = BUILD;

    // Unguarded pages
    if (!moduleKey) return;

    if (!window.AUTH?.ensureSupabase || !window.AUTH?.getSessionUserProfile) {
      console.warn("C.S.V. BEACON module guard: AUTH is not available.");
      return;
    }

    const bundle = await window.AUTH.getSessionUserProfile();

    // If logged out, let the page's existing auth logic handle login/redirect.
    if (!bundle?.session?.user) return;

    const role = bundle?.profile?.role;

    // Platform users can access everything.
    if (isPlatformRole(role)) return;

    const sb = window.AUTH.ensureSupabase();

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
