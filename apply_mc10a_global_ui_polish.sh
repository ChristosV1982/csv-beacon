#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc10a_global_ui_polish

for f in \
  public/csvb-ui-polish.css \
  public/csvb-ui-polish.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc10a_global_ui_polish/$(basename "$f")
  fi
done

for f in public/*.html; do
  cp "$f" backup_before_mc10a_global_ui_polish/$(basename "$f")
done

cat > public/csvb-ui-polish.css <<'CSS'
/* public/csvb-ui-polish.css
   C.S.V. BEACON — MC-10A Global Interface Polish

   Visual-only.
   No business logic.
   No RLS/auth/database effect.
*/

:root{
  --csvb-page-max: 1760px;
  --csvb-page-pad: 14px;
  --csvb-compact-gap: 8px;
  --csvb-compact-radius: 10px;
  --csvb-soft-border: #D6E4F5;
  --csvb-soft-bg: #F7FAFE;
  --csvb-deep-blue: #062A5E;
  --csvb-text: #163457;
  --csvb-muted: #5E6F86;
}

/* ------------------------------------------------------------
   1. Typography: reduce excessive boldness
------------------------------------------------------------ */

body,
td,
p,
li,
small,
input,
select,
textarea,
.muted,
.small,
.card,
.panel,
.qa-muted,
.qo-muted,
.assignmentHelp{
  font-weight: 400 !important;
}

label,
.badge,
.pill,
.qa-pill,
.qo-pill{
  font-weight: 500 !important;
}

*[style*="font-weight:800"],
*[style*="font-weight: 800"],
*[style*="font-weight:850"],
*[style*="font-weight: 850"],
*[style*="font-weight:900"],
*[style*="font-weight: 900"],
*[style*="font-weight:950"],
*[style*="font-weight: 950"]{
  font-weight: 500 !important;
}

/* Keep true headers bold enough */
:is(
  h1,h2,h3,h4,h5,h6,
  th,
  .title,
  .cardTitle,
  .sectionTitle,
  .pageTitle,
  .assignmentBoxTitle,
  .qa-title,
  .qo-title,
  .brand,
  .topbar b,
  header b
){
  font-weight: 700 !important;
}

/* Buttons should still feel clickable, but not heavy */
button,
.btn,
.btn2,
.btnSmall,
.qa-btn,
.qo-btn,
.csvb-override-launcher{
  font-weight: 600 !important;
}

/* ------------------------------------------------------------
   2. Use more available screen width
------------------------------------------------------------ */

.wrap,
.container,
.page,
.content,
.main,
main,
.dashboardWrap,
.dashboard,
.appWrap,
.adminWrap{
  max-width: min(var(--csvb-page-max), calc(100vw - 24px)) !important;
  width: calc(100vw - 24px) !important;
  margin-left: auto !important;
  margin-right: auto !important;
  box-sizing: border-box !important;
  padding-left: var(--csvb-page-pad) !important;
  padding-right: var(--csvb-page-pad) !important;
}

@media (min-width: 1800px){
  :root{
    --csvb-page-max: 1880px;
  }
}

/* Tables should use available width */
table,
.table,
.qa-table,
.qo-table{
  width: 100% !important;
}

td,
th{
  line-height: 1.32 !important;
  vertical-align: top !important;
}

/* ------------------------------------------------------------
   3. Compact cards, panels and layout gaps
------------------------------------------------------------ */

.card,
.panel,
.qa-panel,
.qo-panel,
.assignmentBox,
.qa-box,
.qo-box{
  padding: 12px !important;
  border-radius: 12px !important;
}

.grid,
.qa-grid,
.assignmentGrid{
  gap: 10px !important;
}

.row,
.qa-row,
.qo-row,
.actions{
  gap: 6px !important;
}

/* Reduce vertical whitespace inside common content blocks */
.card h1,
.card h2,
.card h3,
.panel h1,
.panel h2,
.panel h3,
.qa-panel h1,
.qa-panel h2,
.qo-panel h1,
.qo-panel h2{
  margin-top: 0 !important;
  margin-bottom: 6px !important;
}

/* ------------------------------------------------------------
   4. Smaller button buffers
------------------------------------------------------------ */

button,
.btn,
.btn2,
.qa-btn,
.qo-btn{
  padding: 7px 10px !important;
  border-radius: 9px !important;
  line-height: 1.15 !important;
}

.btnSmall,
button.btnSmall,
.qa-btn.btnSmall,
.qo-btn.btnSmall{
  padding: 5px 8px !important;
  border-radius: 8px !important;
  font-size: .86rem !important;
}

input,
select,
textarea,
.qa-input,
.qa-select,
.qa-textarea,
.qo-input,
.qo-select,
.qo-textarea{
  padding: 8px 9px !important;
  border-radius: 9px !important;
}

/* ------------------------------------------------------------
   5. Friendlier dashboard/module cards
------------------------------------------------------------ */

[data-card]{
  position: relative;
  transition: transform .12s ease, box-shadow .12s ease, border-color .12s ease;
}

[data-card]:hover{
  transform: translateY(-1px);
  box-shadow: 0 12px 30px rgba(3,27,63,.10) !important;
  border-color: #AEE3F1 !important;
}

.csvb-card-icon{
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  min-width: 30px;
  border-radius: 10px;
  margin-right: 8px;
  background: #E9F7FB;
  border: 1px solid #AEE3F1;
  color: var(--csvb-deep-blue);
  font-size: 1rem;
  line-height: 1;
}

.csvb-card-title-icon-wrap{
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.csvb-button-icon{
  display: inline-block;
  margin-right: 5px;
  opacity: .9;
}

/* ------------------------------------------------------------
   6. Cleaner tables
------------------------------------------------------------ */

thead th{
  padding: 7px 8px !important;
  white-space: nowrap;
}

tbody td{
  padding: 7px 8px !important;
}

tbody tr:hover td{
  background: #FAFDFF;
}

/* ------------------------------------------------------------
   7. Reduce overly loud helper text
------------------------------------------------------------ */

.muted,
.small,
.qa-muted,
.qo-muted,
.assignmentHelp{
  color: var(--csvb-muted) !important;
}

/* ------------------------------------------------------------
   8. Keep important warnings readable
------------------------------------------------------------ */

.warn,
.warning,
.msg.warn,
.qa-msg.warn,
.qo-msg.warn{
  font-weight: 500 !important;
}

.err,
.error,
.msg.err,
.qa-msg.err,
.qo-msg.err{
  font-weight: 500 !important;
}
CSS

cat > public/csvb-ui-polish.js <<'JS'
// public/csvb-ui-polish.js
// C.S.V. BEACON — MC-10A Global Interface Polish
// Visual-only. Adds small icons and compact UI affordances.

(() => {
  "use strict";

  const BUILD = "MC10A-2026-04-30";

  const cardIcons = {
    library: "📚",
    compare: "📊",
    vessel: "🚢",
    tasks: "✅",
    company: "🏢",
    assignments: "🗂️",
    post: "📝",
    poststats: "📈",
    inspector_intelligence: "🧭",
    audit_observations: "🔎",
    reports: "📑",
    inspector: "👁️",
    qeditor: "✏️",
    suadmin: "⚙️"
  };

  const buttonIconRules = [
    [/dashboard/i, "⌂"],
    [/login/i, "↪"],
    [/logout/i, "↩"],
    [/switch user/i, "⇄"],
    [/refresh|reload/i, "↻"],
    [/save/i, "✓"],
    [/create|new/i, "+"],
    [/open/i, "›"],
    [/delete|remove/i, "×"],
    [/assign/i, "→"],
    [/upload/i, "↑"],
    [/download/i, "↓"],
    [/search/i, "⌕"],
    [/filter/i, "⛃"],
    [/question assignments/i, "🗂️"],
    [/question overrides/i, "✏️"],
    [/company question overrides/i, "✏️"]
  ];

  function markBuild() {
    window.CSVB_UI_POLISH_BUILD = BUILD;
    document.documentElement.setAttribute("data-csvb-ui-polish", BUILD);
  }

  function addCardIcons() {
    document.querySelectorAll("[data-card]").forEach((card) => {
      const key = card.getAttribute("data-card");
      const icon = cardIcons[key];

      if (!icon || card.querySelector(".csvb-card-icon")) return;

      const title =
        card.querySelector("h1,h2,h3,h4,.title,.cardTitle,.sectionTitle,b") ||
        card.firstElementChild;

      const badge = document.createElement("span");
      badge.className = "csvb-card-icon";
      badge.setAttribute("aria-hidden", "true");
      badge.textContent = icon;

      if (title) {
        title.classList.add("csvb-card-title-icon-wrap");
        title.prepend(badge);
      } else {
        card.prepend(badge);
      }
    });
  }

  function addButtonIcons() {
    document.querySelectorAll("button, a.btn, a.btn2, .qa-btn, .qo-btn").forEach((btn) => {
      if (btn.dataset.csvbIconed === "1") return;

      const text = String(btn.textContent || "").trim();
      if (!text) return;

      let icon = "";

      for (const [rx, ico] of buttonIconRules) {
        if (rx.test(text)) {
          icon = ico;
          break;
        }
      }

      if (!icon) return;

      const span = document.createElement("span");
      span.className = "csvb-button-icon";
      span.setAttribute("aria-hidden", "true");
      span.textContent = icon;

      btn.prepend(span);
      btn.dataset.csvbIconed = "1";
    });
  }

  function polish() {
    markBuild();
    addCardIcons();
    addButtonIcons();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", polish);
  } else {
    polish();
  }

  // Re-apply lightly after late-rendered admin panels load.
  setTimeout(polish, 800);
  setTimeout(polish, 1800);
})();
JS

node <<'NODE'
const fs = require("fs");
const path = require("path");

const cssTag = '<link rel="stylesheet" href="./csvb-ui-polish.css?v=20260430_1" />';
const jsTag = '<script src="./csvb-ui-polish.js?v=20260430_1"></script>';

for (const file of fs.readdirSync("public")) {
  if (!file.endsWith(".html")) continue;

  const p = path.join("public", file);
  let html = fs.readFileSync(p, "utf8");

  if (!html.includes("csvb-ui-polish.css")) {
    if (html.includes("</head>")) {
      html = html.replace("</head>", `  ${cssTag}\n</head>`);
    } else {
      html = cssTag + "\n" + html;
    }
  }

  if (!html.includes("csvb-ui-polish.js")) {
    if (html.includes("</body>")) {
      html = html.replace("</body>", `  ${jsTag}\n</body>`);
    } else {
      html += "\n" + jsTag + "\n";
    }
  }

  fs.writeFileSync(p, html, "utf8");
}

const sw = "public/service-worker.js";

if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v32-mc10a-global-ui-polish";'
    );
  }

  if (!s.includes('"./csvb-ui-polish.css"')) {
    s = s.replace(
      '  "./csvb-beacon-theme.css",',
      '  "./csvb-beacon-theme.css",\n  "./csvb-ui-polish.css",'
    );
  }

  if (!s.includes('"./csvb-ui-polish.js"')) {
    if (s.includes('"./csvb-module-guard.js"')) {
      s = s.replace(
        '"./csvb-module-guard.js"',
        '"./csvb-module-guard.js",\n  "./csvb-ui-polish.js"'
      );
    }
  }

  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC10A_GLOBAL_UI_POLISH_APPLIED.txt",
  "MC-10A applied: global UI polish, lighter typography, wider layout, compact buttons, dashboard/icons. Visual-only.\\n",
  "utf8"
);

console.log("DONE: MC-10A Global UI Polish applied.");
NODE

echo "DONE: MC-10A completed."
echo "Next: open Dashboard and hard refresh with Ctrl + Shift + R."
