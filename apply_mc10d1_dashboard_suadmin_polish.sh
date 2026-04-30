#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc10d1_dashboard_suadmin_polish

for f in \
  public/q-dashboard.html \
  public/su-admin.html \
  public/csvb-dashboard-polish.css \
  public/csvb-dashboard-polish.js \
  public/csvb-su-admin-polish.css \
  public/csvb-su-admin-polish.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc10d1_dashboard_suadmin_polish/$(basename "$f")
  fi
done

cat > public/csvb-dashboard-polish.css <<'CSS'
/* C.S.V. BEACON — MC-10D1 Dashboard Polish */

html[data-csvb-page="q-dashboard.html"] .csvb-dashboard-helper-strip{
  width:100%;
  max-width:100%;
  margin:8px auto 10px;
  padding:9px 12px;
  border:1px solid #D6E4F5;
  border-radius:12px;
  background:#FFFFFF;
  box-shadow:0 8px 20px rgba(3,27,63,.05);
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
}

html[data-csvb-page="q-dashboard.html"] .csvb-dashboard-helper-title{
  color:#062A5E;
  font-weight:700;
  display:flex;
  align-items:center;
  gap:7px;
}

html[data-csvb-page="q-dashboard.html"] .csvb-dashboard-helper-note{
  color:#5E6F86;
  font-size:.9rem;
}

html[data-csvb-page="q-dashboard.html"] [data-card]{
  min-height:132px !important;
  display:flex !important;
  flex-direction:column !important;
  justify-content:space-between !important;
}

html[data-csvb-page="q-dashboard.html"] [data-card] h1,
html[data-csvb-page="q-dashboard.html"] [data-card] h2,
html[data-csvb-page="q-dashboard.html"] [data-card] h3,
html[data-csvb-page="q-dashboard.html"] [data-card] b{
  font-size:1.02rem !important;
  line-height:1.2 !important;
}

html[data-csvb-page="q-dashboard.html"] [data-card] p,
html[data-csvb-page="q-dashboard.html"] [data-card] .muted{
  font-size:.9rem !important;
  line-height:1.25 !important;
}

html[data-csvb-page="q-dashboard.html"] .csvb-card-purpose{
  margin-top:6px;
  color:#5E6F86;
  font-size:.82rem;
  line-height:1.25;
  border-top:1px solid #E1ECF7;
  padding-top:6px;
}

html[data-csvb-page="q-dashboard.html"] .csvb-dashboard-section-label{
  width:100%;
  margin:12px 0 4px;
  color:#062A5E;
  font-weight:700;
  display:flex;
  align-items:center;
  gap:8px;
}

html[data-csvb-page="q-dashboard.html"] .csvb-dashboard-section-label::before{
  content:"";
  width:4px;
  height:18px;
  border-radius:999px;
  background:#062A5E;
}
CSS

cat > public/csvb-dashboard-polish.js <<'JS'
// C.S.V. BEACON — MC-10D1 Dashboard Polish
// Visual/helper-only.

(() => {
  "use strict";

  const BUILD = "MC10D1-DASHBOARD-2026-04-30";
  window.CSVB_DASHBOARD_POLISH_BUILD = BUILD;

  const cardMeta = {
    library: {
      icon: "📚",
      purpose: "Review the locked SIRE 2.0 question library without editing.",
      help: "Open the read-only SIRE 2.0 question library."
    },
    compare: {
      icon: "📊",
      purpose: "Compare self-assessment results against post-inspection findings.",
      help: "Open comparison statistics between pre-inspection and post-inspection data."
    },
    vessel: {
      icon: "🚢",
      purpose: "View questionnaires assigned to a selected vessel.",
      help: "Open vessel questionnaire view."
    },
    tasks: {
      icon: "✅",
      purpose: "Open self-assessment tasks assigned to your role or position.",
      help: "Open your assigned self-assessment tasks."
    },
    company: {
      icon: "🏢",
      purpose: "Build questionnaires from assigned effective question libraries.",
      help: "Open Company Builder to create questionnaires."
    },
    assignments: {
      icon: "🗂️",
      purpose: "Create self-assessment campaigns and assign questionnaires.",
      help: "Open self-assessment assignment management."
    },
    post: {
      icon: "📝",
      purpose: "Import and review stored SIRE post-inspection reports.",
      help: "Open Post-Inspection Entry."
    },
    poststats: {
      icon: "📈",
      purpose: "Review post-inspection statistics and trends.",
      help: "Open Post-Inspection statistics."
    },
    inspector_intelligence: {
      icon: "🧭",
      purpose: "Review inspector history and observation patterns.",
      help: "Open Inspector Intelligence."
    },
    audit_observations: {
      icon: "🔎",
      purpose: "Record and manage internal/external audit observations.",
      help: "Open Audit Observations."
    },
    reports: {
      icon: "📑",
      purpose: "Open reporting and export tools.",
      help: "Open fleet reports and export tools."
    },
    inspector: {
      icon: "👁️",
      purpose: "Open inspector or third-party view, as permitted.",
      help: "Open Inspector / Third-Party portal."
    },
    qeditor: {
      icon: "✏️",
      purpose: "Manage master questions, company questions, PGNOs, and expected evidence.",
      help: "Open Questions Editor."
    },
    suadmin: {
      icon: "⚙️",
      purpose: "Manage companies, users, vessels, modules, assignments, and platform controls.",
      help: "Open Superuser Administration."
    }
  };

  function esc(v){
    return String(v ?? "")
      .replaceAll("&","&amp;")
      .replaceAll("<","&lt;")
      .replaceAll(">","&gt;")
      .replaceAll('"',"&quot;");
  }

  function addHelperStrip(){
    if (document.getElementById("csvbDashboardHelperStrip")) return;

    const strip = document.createElement("div");
    strip.id = "csvbDashboardHelperStrip";
    strip.className = "csvb-dashboard-helper-strip";
    strip.innerHTML = `
      <div class="csvb-dashboard-helper-title">🧭 Dashboard Navigation</div>
      <div class="csvb-dashboard-helper-note">
        Hover over module buttons for short guidance. Visible modules depend on role and company access.
      </div>
    `;

    const topbar = document.querySelector("header,.topbar,.appHeader");
    if (topbar && topbar.parentElement) {
      topbar.insertAdjacentElement("afterend", strip);
      return;
    }

    const main = document.querySelector("main,.wrap,body");
    main.prepend(strip);
  }

  function polishCards(){
    document.querySelectorAll("[data-card]").forEach((card) => {
      const key = card.getAttribute("data-card");
      const meta = cardMeta[key];
      if (!meta) return;

      card.setAttribute("data-csvb-help", meta.help);

      const openBtn = Array.from(card.querySelectorAll("button,a")).find((x) =>
        /open/i.test(String(x.textContent || ""))
      );
      if (openBtn) {
        openBtn.setAttribute("data-csvb-help", meta.help);
      }

      if (!card.querySelector(".csvb-card-purpose")) {
        const purpose = document.createElement("div");
        purpose.className = "csvb-card-purpose";
        purpose.textContent = meta.purpose;
        card.appendChild(purpose);
      }

      const title = card.querySelector("h1,h2,h3,b,.title,.cardTitle") || card.firstElementChild;
      if (title && !title.dataset.csvbDashboardIconed) {
        title.dataset.csvbDashboardIconed = "1";

        if (!title.querySelector(".csvb-card-icon")) {
          const span = document.createElement("span");
          span.className = "csvb-card-icon";
          span.textContent = meta.icon;
          title.prepend(span);
        }
      }
    });
  }

  function polish(){
    addHelperStrip();
    polishCards();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", polish);
  } else {
    polish();
  }

  setTimeout(polish, 800);
  setTimeout(polish, 1800);
})();
JS

cat > public/csvb-su-admin-polish.css <<'CSS'
/* C.S.V. BEACON — MC-10D1 Superuser Administration Polish */

html[data-csvb-page="su-admin.html"] .csvb-su-helper-strip{
  max-width:100%;
  margin:8px auto 10px;
  padding:9px 12px;
  border:1px solid #D6E4F5;
  border-radius:12px;
  background:#fff;
  color:#163457;
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
  box-shadow:0 8px 20px rgba(3,27,63,.05);
}

html[data-csvb-page="su-admin.html"] .csvb-su-helper-title{
  color:#062A5E;
  font-weight:700;
  display:flex;
  align-items:center;
  gap:7px;
}

html[data-csvb-page="su-admin.html"] .csvb-su-helper-note{
  color:#5E6F86;
  font-size:.9rem;
}

html[data-csvb-page="su-admin.html"] .csvb-su-tabbar-polished{
  position:sticky;
  top:0;
  z-index:50;
  background:rgba(244,248,252,.94);
  backdrop-filter:blur(6px);
  padding:6px 0;
  border-bottom:1px solid #D6E4F5;
}

html[data-csvb-page="su-admin.html"] button.csvb-su-tab-iconed{
  display:inline-flex;
  align-items:center;
  gap:6px;
}

html[data-csvb-page="su-admin.html"] .csvb-su-tab-icon{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:20px;
  height:20px;
  border-radius:7px;
  background:#E9F7FB;
  color:#062A5E;
  border:1px solid #AEE3F1;
  font-size:.85rem;
}

html[data-csvb-page="su-admin.html"] .csvb-admin-danger-note{
  margin:6px 0;
  color:#8A5A00;
  background:#FFF6E0;
  border:1px solid #F6D58F;
  border-radius:10px;
  padding:7px 9px;
  font-size:.88rem;
}

html[data-csvb-page="su-admin.html"] table{
  font-size:.9rem !important;
}

html[data-csvb-page="su-admin.html"] .qa-panel,
html[data-csvb-page="su-admin.html"] .qo-panel{
  margin-top:10px !important;
}
CSS

cat > public/csvb-su-admin-polish.js <<'JS'
// C.S.V. BEACON — MC-10D1 Superuser Administration Polish
// Visual/helper-only.

(() => {
  "use strict";

  const BUILD = "MC10D1-SUADMIN-2026-04-30";
  window.CSVB_SU_ADMIN_POLISH_BUILD = BUILD;

  const tabMeta = [
    { rx:/companies/i, icon:"🏢", help:"Manage company tenants, company details, enabled modules, and linked vessels/users." },
    { rx:/users/i, icon:"👤", help:"Create, disable, enable, reset, and assign users to companies or vessels." },
    { rx:/vessels/i, icon:"🚢", help:"Create, activate, deactivate, delete unused vessels, and assign vessels to companies." },
    { rx:/rights matrix/i, icon:"🛡️", help:"Review role and module access rights." },
    { rx:/question assignments/i, icon:"🗂️", help:"Assign question sets or individual questions to companies and control override permissions." },
    { rx:/question overrides/i, icon:"✏️", help:"Review, approve, publish, reject, or archive company question override submissions." }
  ];

  const actionHelp = [
    { rx:/new company/i, help:"Start a new company/tenant record." },
    { rx:/save company/i, help:"Save company details and status." },
    { rx:/create user/i, help:"Create a new user account and profile." },
    { rx:/reset password/i, help:"Set a new password for this user." },
    { rx:/disable/i, help:"Disable this user/item without permanently deleting history." },
    { rx:/activate/i, help:"Activate this vessel or user again." },
    { rx:/deactivate/i, help:"Deactivate this vessel or item while preserving history." },
    { rx:/delete/i, help:"Delete only if you are sure this item is unused and not needed for history." },
    { rx:/assign \/ update set/i, help:"Save or update question set assignment settings for the selected company." },
    { rx:/refresh/i, help:"Reload the latest administration data from the database." }
  ];

  function addHelperStrip(){
    if (document.getElementById("csvbSuAdminHelperStrip")) return;

    const strip = document.createElement("div");
    strip.id = "csvbSuAdminHelperStrip";
    strip.className = "csvb-su-helper-strip";
    strip.innerHTML = `
      <div class="csvb-su-helper-title">⚙️ Superuser Administration</div>
      <div class="csvb-su-helper-note">
        Manage platform companies, users, vessels, module access, question assignments, and approvals. Hover over actions for guidance.
      </div>
    `;

    const topbar = document.querySelector("header,.topbar,.appHeader");
    if (topbar && topbar.parentElement) {
      topbar.insertAdjacentElement("afterend", strip);
      return;
    }

    const host = document.querySelector(".wrap,main,body");
    host.prepend(strip);
  }

  function polishTabs(){
    const buttons = Array.from(document.querySelectorAll("button"));

    buttons.forEach((btn) => {
      const text = String(btn.textContent || "").trim();

      for (const meta of tabMeta) {
        if (!meta.rx.test(text)) continue;

        btn.setAttribute("data-csvb-help", meta.help);

        if (!btn.classList.contains("csvb-su-tab-iconed")) {
          btn.classList.add("csvb-su-tab-iconed");

          const span = document.createElement("span");
          span.className = "csvb-su-tab-icon";
          span.textContent = meta.icon;
          btn.prepend(span);
        }

        const parent = btn.parentElement;
        if (parent && buttons.filter((b) => b.parentElement === parent).length >= 3) {
          parent.classList.add("csvb-su-tabbar-polished");
        }

        break;
      }
    });
  }

  function polishActions(){
    document.querySelectorAll("button").forEach((btn) => {
      const text = String(btn.textContent || "").trim();

      for (const rule of actionHelp) {
        if (rule.rx.test(text)) {
          btn.setAttribute("data-csvb-help", rule.help);
          break;
        }
      }
    });
  }

  function addDangerNote(){
    if (document.getElementById("csvbSuAdminDangerNote")) return;

    const anyDelete = Array.from(document.querySelectorAll("button")).find((b) =>
      /delete/i.test(String(b.textContent || ""))
    );

    if (!anyDelete) return;

    const note = document.createElement("div");
    note.id = "csvbSuAdminDangerNote";
    note.className = "csvb-admin-danger-note";
    note.textContent = "Deletion actions should be used only for unused records. Prefer deactivate/disable when historical records may exist.";

    const panel = anyDelete.closest(".panel,.qa-panel,.qo-panel,section,div");
    if (panel) {
      panel.prepend(note);
    }
  }

  function polish(){
    addHelperStrip();
    polishTabs();
    polishActions();
    addDangerNote();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", polish);
  } else {
    polish();
  }

  setTimeout(polish, 700);
  setTimeout(polish, 1600);
  setTimeout(polish, 3000);
})();
JS

node <<'NODE'
const fs = require("fs");

function inject(file, css, js){
  if (!fs.existsSync(file)) return;

  let html = fs.readFileSync(file, "utf8");

  if (!html.includes(css)) {
    const tag = `<link rel="stylesheet" href="./${css}?v=20260430_1" />`;
    html = html.includes("</head>")
      ? html.replace("</head>", `  ${tag}\n</head>`)
      : tag + "\n" + html;
  }

  if (!html.includes(js)) {
    const tag = `<script src="./${js}?v=20260430_1"></script>`;
    html = html.includes("</body>")
      ? html.replace("</body>", `  ${tag}\n</body>`)
      : html + "\n" + tag + "\n";
  }

  fs.writeFileSync(file, html, "utf8");
}

inject("public/q-dashboard.html", "csvb-dashboard-polish.css", "csvb-dashboard-polish.js");
inject("public/su-admin.html", "csvb-su-admin-polish.css", "csvb-su-admin-polish.js");

const sw = "public/service-worker.js";

if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v35-mc10d1-dashboard-suadmin-polish";'
    );
  }

  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC10D1_DASHBOARD_SUADMIN_POLISH_APPLIED.txt",
  "MC-10D1 applied: dashboard and superuser administration module-specific polish, icons, helper strips, and contextual help.\\n",
  "utf8"
);

console.log("DONE: MC-10D1 Dashboard + Superuser Administration polish applied.");
NODE

echo "DONE: MC-10D1 completed."
echo "Next: hard refresh Dashboard and Superuser Administration with Ctrl + Shift + R."
