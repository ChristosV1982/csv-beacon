#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc4b_dashboard_module_visibility

cp public/q-dashboard.html backup_before_mc4b_dashboard_module_visibility/q-dashboard.html

if [ -f "public/service-worker.js" ]; then
  cp public/service-worker.js backup_before_mc4b_dashboard_module_visibility/service-worker.js
fi

node <<'NODE'
const fs = require("fs");

const file = "public/q-dashboard.html";

if (!fs.existsSync(file)) {
  console.error("ERROR: public/q-dashboard.html not found.");
  process.exit(1);
}

let html = fs.readFileSync(file, "utf8");

const start = html.lastIndexOf("<script>");
const end = html.lastIndexOf("</script>");

if (start < 0 || end < 0 || end < start) {
  throw new Error("Could not find final script block in q-dashboard.html");
}

const newScript = `<script>
    function showWarn(msg){
      const w=document.getElementById("warnBox");
      w.textContent=msg||"";
      w.style.display=msg?"block":"none";
    }

    function clearWarn(){
      showWarn("");
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

    async function loadEnabledModules(bundle){
      const role = bundle?.profile?.role || "";
      const R = AUTH.ROLES || {};
      const isPlatform =
        role === R.SUPER_ADMIN ||
        role === "platform_owner" ||
        bundle?.isPlatformAdmin === true;

      if (isPlatform) {
        return {
          isPlatform: true,
          enabled: new Set(Object.values(DASHBOARD_MODULE_BY_CARD).filter(Boolean)),
          raw: []
        };
      }

      const sb = AUTH.ensureSupabase();

      const { data, error } = await sb.rpc("csvb_my_company_modules");

      if (error) {
        throw new Error("Could not load company module access: " + error.message);
      }

      const enabled = new Set(
        (data || [])
          .filter((m) => m.is_enabled === true)
          .map((m) => m.module_key)
      );

      return {
        isPlatform: false,
        enabled,
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

      /* Logged out: keep only public/open study cards */
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

      /* Always role-available when logged in, still filtered by company modules */
      setVisible("library", true, moduleAccess);
      setVisible("compare", true, moduleAccess);
      setVisible("tasks", true, moduleAccess);
      setVisible("vessel", true, moduleAccess);

      /* Questions Editor visibility */
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

html = html.slice(0, start) + newScript + html.slice(end + "</script>".length);

fs.writeFileSync(file, html, "utf8");

const sw = "public/service-worker.js";

if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v17-mc4-dashboard-module-visibility";'
    );
  }

  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC4B_DASHBOARD_MODULE_VISIBILITY_APPLIED.txt",
  "Dashboard now filters cards by company_modules through csvb_my_company_modules RPC. No auth/Supabase key/RLS changes.\\n",
  "utf8"
);

console.log("DONE: MC-4B dashboard module visibility applied.");
NODE

echo "DONE: MC-4B completed."
echo "Next: open Dashboard and hard refresh with Ctrl + Shift + R."
