#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc8b_superuser_company_context

for f in \
  public/q-dashboard.html \
  public/csvb-module-guard.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc8b_superuser_company_context/$(basename "$f")
  fi
done

node <<'NODE'
const fs = require("fs");

/* ============================================================
   Patch q-dashboard.html
============================================================ */

const dashboard = "public/q-dashboard.html";

if (!fs.existsSync(dashboard)) {
  throw new Error("public/q-dashboard.html not found.");
}

let html = fs.readFileSync(dashboard, "utf8");

/* Add selector UI after userBadge */
if (!html.includes('id="csvbCompanyViewWrap"')) {
  html = html.replace(
    '<div id="userBadge" style="font-weight:800;opacity:.95;"></div>',
    `<div id="userBadge" style="font-weight:800;opacity:.95;"></div>
      <div id="csvbCompanyViewWrap" class="csvb-company-view-wrap" style="display:none;">
        <span class="csvb-company-view-label">View as</span>
        <select id="csvbCompanyViewSelect" class="csvb-company-view-select">
          <option value="">Platform</option>
        </select>
        <button class="btn2 csvb-company-view-clear" id="csvbCompanyViewClearBtn" type="button">Platform view</button>
      </div>`
  );
}

/* Add styling */
if (!html.includes(".csvb-company-view-wrap")) {
  html = html.replace(
    "</style>",
    `
    .csvb-company-view-wrap{
      display:flex;
      align-items:center;
      gap:8px;
      padding:6px 8px;
      border:1px solid rgba(255,255,255,.28);
      border-radius:12px;
      background:rgba(255,255,255,.10);
    }
    .csvb-company-view-label{
      color:#BFEFF4;
      font-weight:900;
      font-size:.85rem;
    }
    .csvb-company-view-select{
      min-width:210px;
      max-width:280px;
      border-radius:10px;
      border:1px solid rgba(255,255,255,.35);
      padding:8px 10px;
      font-weight:850;
      color:#062A5E;
      background:#fff;
    }
    .csvb-company-view-clear{
      padding:8px 10px;
    }
    .csvb-sim-banner{
      margin:0 0 12px 0;
      padding:10px 12px;
      border-radius:12px;
      border:1px solid #F6D58F;
      background:#FFF6E0;
      color:#8A5A00;
      font-weight:900;
    }
  </style>`
  );
}

/* Replace final dashboard script */
const start = html.lastIndexOf("<script>");
const end = html.lastIndexOf("</script>");

if (start < 0 || end < 0 || end < start) {
  throw new Error("Could not find final script block in q-dashboard.html.");
}

const script = `<script>
    const CSVB_COMPANY_VIEW_ID_KEY = "csvb_superuser_company_view_id";
    const CSVB_COMPANY_VIEW_NAME_KEY = "csvb_superuser_company_view_name";

    function showWarn(msg){
      const w=document.getElementById("warnBox");
      w.textContent=msg||"";
      w.style.display=msg?"block":"none";
    }

    function clearWarn(){
      showWarn("");
    }

    function isPlatformRole(role){
      return role === "super_admin" || role === "platform_owner";
    }

    function getSimulatedCompanyId(){
      return localStorage.getItem(CSVB_COMPANY_VIEW_ID_KEY) || "";
    }

    function getSimulatedCompanyName(){
      return localStorage.getItem(CSVB_COMPANY_VIEW_NAME_KEY) || "";
    }

    function setSimulatedCompany(id, name){
      if (id) {
        localStorage.setItem(CSVB_COMPANY_VIEW_ID_KEY, id);
        localStorage.setItem(CSVB_COMPANY_VIEW_NAME_KEY, name || "");
      } else {
        localStorage.removeItem(CSVB_COMPANY_VIEW_ID_KEY);
        localStorage.removeItem(CSVB_COMPANY_VIEW_NAME_KEY);
      }
    }

    const DASHBOARD_MODULE_BY_CARD = {
      library: "read_only_library",
      compare: "post_inspection_stats",
      vessel: "self_assessment",
      tasks: "self_assessment",
      company: "self_assessment",
      assignments: "self_assessment",
      post: "post_inspection",
      poststats: "post_inspection_stats",
      inspector_intelligence: "inspector_intelligence",
      audit_observations: "audit_observations",
      reports: "fleet_reports",
      inspector: "sire_2_vetting",
      qeditor: "questions_editor",
      suadmin: "platform_administration"
    };

    async function setupSuperuserCompanyContext(bundle){
      const wrap = document.getElementById("csvbCompanyViewWrap");
      const sel = document.getElementById("csvbCompanyViewSelect");
      const clearBtn = document.getElementById("csvbCompanyViewClearBtn");

      if (!wrap || !sel || !clearBtn) return;

      const role = bundle?.profile?.role || "";
      if (!isPlatformRole(role)) {
        wrap.style.display = "none";
        return;
      }

      wrap.style.display = "flex";

      const sb = AUTH.ensureSupabase();

      const { data, error } = await sb.rpc("csvb_admin_list_companies");
      if (error) {
        showWarn("Could not load companies for superuser company context: " + error.message);
        return;
      }

      const current = getSimulatedCompanyId();

      sel.innerHTML = [
        '<option value="">Platform / all companies</option>',
        ...(data || []).map((c) => {
          const label = c.company_name || c.short_name || c.company_code || c.id;
          return '<option value="' + String(c.id).replaceAll('"','&quot;') + '">' +
            String(label).replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;") +
            '</option>';
        })
      ].join("");

      sel.value = current || "";

      sel.addEventListener("change", () => {
        const id = sel.value || "";
        const name = sel.options[sel.selectedIndex]?.textContent || "";
        setSimulatedCompany(id, name);
        location.reload();
      });

      clearBtn.addEventListener("click", () => {
        setSimulatedCompany("", "");
        location.reload();
      });

      if (current) {
        const banner = document.createElement("div");
        banner.className = "csvb-sim-banner";
        banner.textContent =
          "Superuser simulation active: viewing dashboard/module visibility as " +
          (getSimulatedCompanyName() || "selected company") +
          ". RLS remains platform-level for the actual superuser account.";
        const warn = document.getElementById("warnBox");
        if (warn && warn.parentElement && !document.querySelector(".csvb-sim-banner")) {
          warn.parentElement.insertBefore(banner, warn.nextSibling);
        }
      }
    }

    async function loadEnabledModules(bundle){
      const role = bundle?.profile?.role || "";
      const isPlatform = isPlatformRole(role);
      const sb = AUTH.ensureSupabase();

      if (isPlatform) {
        const simulatedCompanyId = getSimulatedCompanyId();

        if (simulatedCompanyId) {
          const { data, error } = await sb.rpc("csvb_admin_list_company_modules", {
            p_company_id: simulatedCompanyId
          });

          if (error) {
            throw new Error("Could not load simulated company module access: " + error.message);
          }

          return {
            isPlatform: false,
            isSimulatedCompany: true,
            simulatedCompanyId,
            simulatedCompanyName: getSimulatedCompanyName(),
            enabled: new Set((data || []).filter((m) => m.is_enabled === true).map((m) => m.module_key)),
            raw: data || []
          };
        }

        return {
          isPlatform: true,
          isSimulatedCompany: false,
          enabled: new Set(Object.values(DASHBOARD_MODULE_BY_CARD).filter(Boolean)),
          raw: []
        };
      }

      const { data, error } = await sb.rpc("csvb_my_company_modules");

      if (error) {
        throw new Error("Could not load company module access: " + error.message);
      }

      return {
        isPlatform: false,
        isSimulatedCompany: false,
        enabled: new Set((data || []).filter((m) => m.is_enabled === true).map((m) => m.module_key)),
        raw: data || []
      };
    }

    function hideAllCards(){
      document.querySelectorAll("[data-card]").forEach((el) => {
        el.style.display = "none";
      });
    }

    function cardAllowedByModule(cardKey, moduleAccess){
      if (moduleAccess?.isPlatform) return true;
      const moduleKey = DASHBOARD_MODULE_BY_CARD[cardKey];
      if (!moduleKey) return true;
      return moduleAccess?.enabled?.has(moduleKey) === true;
    }

    function setVisible(cardKey, roleAllowed, moduleAccess){
      const el = document.querySelector(\`[data-card="\${cardKey}"]\`);
      if (!el) return;
      const allowed = !!roleAllowed && cardAllowedByModule(cardKey, moduleAccess);
      el.style.display = allowed ? "block" : "none";
    }

    (async () => {
      clearWarn();

      const bundle = await AUTH.setupAuthButtons({
        badgeId: "userBadge",
        loginBtnId: "loginBtn",
        logoutBtnId: "logoutBtn",
        switchBtnId: "switchUserBtn"
      });

      await setupSuperuserCompanyContext(bundle);

      if (!bundle?.session?.user) {
        showWarn("You are logged out. Please Login.");

        document.querySelectorAll("[data-card]").forEach(c => {
          const k = c.getAttribute("data-card");
          const keep = (k === "library" || k === "compare");
          c.style.display = keep ? "block" : "none";
        });

        return;
      }

      const moduleAccess = await loadEnabledModules(bundle);
      window.CSVB_DASHBOARD_MODULE_ACCESS = moduleAccess;

      const role = bundle.profile?.role;
      const R = AUTH.ROLES;

      const isSuper = role === R.SUPER_ADMIN || role === "platform_owner";
      const isCompanyAdmin = role === R.COMPANY_ADMIN;
      const isCompanySup = role === R.COMPANY_SUPERINTENDENT;
      const isVessel = role === R.VESSEL;
      const isInspector = role === R.INSPECTOR;

      hideAllCards();

      setVisible("library", true, moduleAccess);
      setVisible("compare", true, moduleAccess);
      setVisible("tasks", true, moduleAccess);
      setVisible("vessel", true, moduleAccess);

      setVisible("qeditor", (isSuper || isCompanyAdmin || isCompanySup), moduleAccess);

      if (isSuper) {
        [
          "company",
          "assignments",
          "post",
          "poststats",
          "inspector_intelligence",
          "audit_observations",
          "reports",
          "inspector",
          "qeditor",
          "suadmin"
        ].forEach(k => setVisible(k, true, moduleAccess));
        return;
      }

      if (isVessel) {
        setVisible("company", false, moduleAccess);
        setVisible("assignments", false, moduleAccess);
        setVisible("post", false, moduleAccess);
        setVisible("poststats", false, moduleAccess);
        setVisible("inspector_intelligence", false, moduleAccess);
        setVisible("audit_observations", false, moduleAccess);
        setVisible("reports", false, moduleAccess);
        setVisible("inspector", false, moduleAccess);
        setVisible("qeditor", false, moduleAccess);
        setVisible("suadmin", false, moduleAccess);
        return;
      }

      if (isCompanyAdmin) {
        [
          "company",
          "assignments",
          "post",
          "poststats",
          "inspector_intelligence",
          "audit_observations",
          "reports",
          "inspector",
          "qeditor"
        ].forEach(k => setVisible(k, true, moduleAccess));
        setVisible("suadmin", false, moduleAccess);
        return;
      }

      if (isCompanySup) {
        setVisible("company", false, moduleAccess);
        setVisible("assignments", false, moduleAccess);
        setVisible("post", true, moduleAccess);
        setVisible("poststats", true, moduleAccess);
        setVisible("inspector_intelligence", true, moduleAccess);
        setVisible("audit_observations", true, moduleAccess);
        setVisible("reports", true, moduleAccess);
        setVisible("inspector", true, moduleAccess);
        setVisible("qeditor", true, moduleAccess);
        setVisible("suadmin", false, moduleAccess);
        return;
      }

      if (isInspector) {
        setVisible("tasks", false, moduleAccess);
        setVisible("vessel", false, moduleAccess);
        setVisible("inspector", true, moduleAccess);
        setVisible("inspector_intelligence", false, moduleAccess);
        setVisible("audit_observations", false, moduleAccess);
        setVisible("qeditor", false, moduleAccess);
        setVisible("suadmin", false, moduleAccess);
        return;
      }
    })().catch(e => showWarn(String(e?.message || e)));
  </script>`;

html = html.slice(0, start) + script + html.slice(end + "</script>".length);

fs.writeFileSync(dashboard, html, "utf8");

/* ============================================================
   Patch csvb-module-guard.js
============================================================ */

const guard = "public/csvb-module-guard.js";

if (fs.existsSync(guard)) {
  let g = fs.readFileSync(guard, "utf8");

  const patched = `// public/csvb-module-guard.js
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
`;

  fs.writeFileSync(guard, patched, "utf8");
}

/* ============================================================
   Service worker bump
============================================================ */

const sw = "public/service-worker.js";
if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");
  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v23-mc8b-superuser-company-context";'
    );
  }
  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC8B_SUPERUSER_COMPANY_CONTEXT_APPLIED.txt",
  "MC-8B applied: Dashboard superuser company context selector and module guard simulation. No SQL/auth/RLS changes.\\n",
  "utf8"
);

console.log("DONE: MC-8B superuser company context applied.");
NODE

echo "DONE: MC-8B completed."
echo "Next: open Dashboard and hard refresh with Ctrl + Shift + R."
