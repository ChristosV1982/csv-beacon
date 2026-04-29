#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc4c_direct_page_module_guard

cp public/service-worker.js backup_before_mc4c_direct_page_module_guard/service-worker.js 2>/dev/null || true

for f in public/*.html; do
  cp "$f" backup_before_mc4c_direct_page_module_guard/$(basename "$f")
done

cat > public/csvb-module-guard.js <<'JS'
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
JS

node <<'NODE'
const fs = require("fs");

const targetPages = [
  "library.html",

  "q-vessel.html",
  "q-answer.html",
  "sa_tasks.html",
  "sa_assignments.html",
  "q-company.html",

  "sa_compare.html",

  "post_inspection.html",
  "post_inspection_detail.html",
  "post_inspection_observation_detail.html",

  "post_inspection_stats.html",
  "post_inspection_kpis.html",

  "inspector_intelligence.html",
  "audit_observations.html",

  "q-report.html",
  "q-inspector.html",
  "q-questions-editor.html",
  "su-admin.html"
];

const scriptTag = '<script src="./csvb-module-guard.js?v=20260429_1"></script>';

for (const name of targetPages) {
  const file = `public/${name}`;

  if (!fs.existsSync(file)) continue;

  let html = fs.readFileSync(file, "utf8");

  if (html.includes("csvb-module-guard.js")) continue;

  if (html.includes('<script src="./auth.js"></script>')) {
    html = html.replace(
      '<script src="./auth.js"></script>',
      '<script src="./auth.js"></script>\n  ' + scriptTag
    );
  } else if (html.includes('<script src="auth.js"></script>')) {
    html = html.replace(
      '<script src="auth.js"></script>',
      '<script src="auth.js"></script>\n  ' + scriptTag
    );
  } else {
    html = html.replace("</head>", "  " + scriptTag + "\n</head>");
  }

  fs.writeFileSync(file, html, "utf8");
}

const sw = "public/service-worker.js";

if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v18-mc4c-direct-page-module-guard";'
    );
  }

  if (!s.includes('"./csvb-module-guard.js"')) {
    s = s.replace(
      '  "./auth.js",',
      '  "./auth.js",\n  "./csvb-module-guard.js",'
    );
  }

  fs.writeFileSync(sw, s);
}

fs.writeFileSync(
  "public/MC4C_DIRECT_PAGE_MODULE_GUARD_APPLIED.txt",
  "MC-4C applied: direct page module guard added. No auth/Supabase key/RLS changes.\n",
  "utf8"
);

console.log("DONE: MC-4C direct page module guard applied.");
NODE

echo "DONE: MC-4C completed."
echo "Next: hard refresh with Ctrl + Shift + R."
