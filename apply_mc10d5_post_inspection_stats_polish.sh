#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

if [ ! -f "public/post_inspection_stats.html" ]; then
  echo "ERROR: public/post_inspection_stats.html not found."
  exit 1
fi

mkdir -p backup_before_mc10d5_post_inspection_stats_polish

for f in \
  public/post_inspection_stats.html \
  public/post_inspection_kpis.html \
  public/csvb-post-inspection-stats-polish.css \
  public/csvb-post-inspection-stats-polish.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" "backup_before_mc10d5_post_inspection_stats_polish/$(basename "$f")"
  fi
done

cat > public/csvb-post-inspection-stats-polish.css <<'CSS'
/* public/csvb-post-inspection-stats-polish.css
   MC-10D5 — Post-Inspection Stats module polish
   Visual/helper only.
*/

html[data-csvb-page="post_inspection_stats.html"] body,
html[data-csvb-page="post_inspection_kpis.html"] body{
  overflow-x:hidden !important;
}

/* Use available screen width */
html[data-csvb-page="post_inspection_stats.html"] main,
html[data-csvb-page="post_inspection_stats.html"] .wrap,
html[data-csvb-page="post_inspection_stats.html"] .container,
html[data-csvb-page="post_inspection_stats.html"] .page,
html[data-csvb-page="post_inspection_stats.html"] .content,
html[data-csvb-page="post_inspection_kpis.html"] main,
html[data-csvb-page="post_inspection_kpis.html"] .wrap,
html[data-csvb-page="post_inspection_kpis.html"] .container,
html[data-csvb-page="post_inspection_kpis.html"] .page,
html[data-csvb-page="post_inspection_kpis.html"] .content{
  width:100% !important;
  max-width:100% !important;
  padding-left:8px !important;
  padding-right:8px !important;
  box-sizing:border-box !important;
}

/* Helper strip */
.csvb-poststats-helper{
  width:100%;
  max-width:100%;
  margin:8px auto 10px;
  padding:9px 12px;
  border:1px solid #D6E4F5;
  border-radius:12px;
  background:#fff;
  box-shadow:0 8px 20px rgba(3,27,63,.05);
  display:flex;
  align-items:center;
  justify-content:space-between;
  gap:10px;
  flex-wrap:wrap;
}

.csvb-poststats-helper-title{
  color:#062A5E;
  font-weight:700;
  display:flex;
  align-items:center;
  gap:7px;
}

.csvb-poststats-helper-note{
  color:#5E6F86;
  font-size:.9rem;
}

/* Compact controls */
.csvb-poststats-controls,
.csvb-poststats-control-row{
  display:flex !important;
  align-items:center !important;
  gap:8px !important;
  flex-wrap:wrap !important;
  margin:6px 0 !important;
}

.csvb-poststats-controls input,
.csvb-poststats-controls select,
.csvb-poststats-control-row input,
.csvb-poststats-control-row select{
  width:auto !important;
  min-width:180px !important;
  max-width:320px !important;
}

.csvb-poststats-controls button,
.csvb-poststats-control-row button{
  white-space:nowrap !important;
  padding:7px 12px !important;
}

/* KPI / metric cards */
.csvb-poststats-kpi-grid{
  display:grid !important;
  grid-template-columns:repeat(6, minmax(130px, 1fr)) !important;
  gap:8px !important;
  width:100% !important;
  max-width:100% !important;
}

@media(max-width:1400px){
  .csvb-poststats-kpi-grid{
    grid-template-columns:repeat(4, minmax(130px, 1fr)) !important;
  }
}

@media(max-width:900px){
  .csvb-poststats-kpi-grid{
    grid-template-columns:repeat(2, minmax(130px, 1fr)) !important;
  }
}

.csvb-poststats-kpi-card{
  border:1px solid #D6E4F5 !important;
  border-radius:12px !important;
  background:#F7FAFE !important;
  padding:9px 10px !important;
  min-width:0 !important;
}

.csvb-poststats-kpi-card .csvb-poststats-kpi-label{
  color:#5E6F86;
  font-size:.84rem;
  font-weight:500;
  line-height:1.2;
}

.csvb-poststats-kpi-card .csvb-poststats-kpi-value{
  color:#062A5E;
  font-size:1.25rem;
  font-weight:700;
  line-height:1.15;
  margin-top:4px;
}

.csvb-poststats-icon{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:24px;
  height:24px;
  border-radius:8px;
  margin-right:6px;
  background:#E9F7FB;
  border:1px solid #AEE3F1;
}

/* Compact panels */
html[data-csvb-page="post_inspection_stats.html"] section,
html[data-csvb-page="post_inspection_stats.html"] .panel,
html[data-csvb-page="post_inspection_stats.html"] .card,
html[data-csvb-page="post_inspection_stats.html"] .box,
html[data-csvb-page="post_inspection_kpis.html"] section,
html[data-csvb-page="post_inspection_kpis.html"] .panel,
html[data-csvb-page="post_inspection_kpis.html"] .card,
html[data-csvb-page="post_inspection_kpis.html"] .box{
  width:100% !important;
  max-width:100% !important;
  padding:10px !important;
  border-radius:12px !important;
  box-sizing:border-box !important;
}

/* Tables */
html[data-csvb-page="post_inspection_stats.html"] .csvb-poststats-table-wrap,
html[data-csvb-page="post_inspection_kpis.html"] .csvb-poststats-table-wrap{
  width:100% !important;
  max-width:100% !important;
  overflow-x:auto !important;
}

html[data-csvb-page="post_inspection_stats.html"] table,
html[data-csvb-page="post_inspection_kpis.html"] table{
  width:100% !important;
  min-width:860px !important;
  table-layout:auto !important;
  border-collapse:collapse !important;
}

html[data-csvb-page="post_inspection_stats.html"] th,
html[data-csvb-page="post_inspection_stats.html"] td,
html[data-csvb-page="post_inspection_kpis.html"] th,
html[data-csvb-page="post_inspection_kpis.html"] td{
  white-space:normal !important;
  word-break:normal !important;
  overflow-wrap:break-word !important;
  line-height:1.25 !important;
  padding:6px 7px !important;
}

/* Chart/canvas areas */
html[data-csvb-page="post_inspection_stats.html"] canvas,
html[data-csvb-page="post_inspection_stats.html"] svg,
html[data-csvb-page="post_inspection_kpis.html"] canvas,
html[data-csvb-page="post_inspection_kpis.html"] svg{
  max-width:100% !important;
}

/* Section headers */
.csvb-poststats-section-title{
  display:flex;
  align-items:center;
  gap:6px;
  color:#062A5E;
  font-weight:700;
  margin-bottom:6px;
}

/* Action grouping */
.csvb-poststats-actions{
  display:flex !important;
  align-items:center !important;
  gap:8px !important;
  flex-wrap:wrap !important;
}

.csvb-poststats-actions button,
.csvb-poststats-actions a{
  white-space:nowrap !important;
}
CSS

cat > public/csvb-post-inspection-stats-polish.js <<'JS'
// public/csvb-post-inspection-stats-polish.js
// MC-10D5 — Post-Inspection Stats polish
// Visual/helper only.

(() => {
  "use strict";

  const BUILD = "MC10D5-2026-04-30";

  function pageName() {
    return String(window.location.pathname || "").split("/").pop() || "";
  }

  function mark() {
    window.CSVB_POST_INSPECTION_STATS_POLISH_BUILD = BUILD;
    document.documentElement.setAttribute("data-csvb-poststats-polish", BUILD);
    document.documentElement.setAttribute("data-csvb-page", pageName());
  }

  function textOf(el) {
    return String(el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function addHelperStrip() {
    if (document.getElementById("csvbPostStatsHelper")) return;

    const strip = document.createElement("div");
    strip.id = "csvbPostStatsHelper";
    strip.className = "csvb-poststats-helper";
    strip.innerHTML = `
      <div class="csvb-poststats-helper-title">📈 Post-Inspection Statistics</div>
      <div class="csvb-poststats-helper-note">
        Review observation trends, inspection KPIs, vessel performance and recurring SIRE 2.0 findings. Hover over actions for guidance.
      </div>
    `;

    const topbar = document.querySelector("header,.topbar,.appHeader");
    if (topbar && topbar.parentElement) {
      topbar.insertAdjacentElement("afterend", strip);
      return;
    }

    const host = document.querySelector("main,.wrap,.container,body");
    host.prepend(strip);
  }

  function groupControls() {
    const candidates = Array.from(document.querySelectorAll("section,.panel,.card,.box,div"));

    candidates.forEach((box) => {
      if (box.dataset.csvbPoststatsControls === "1") return;

      const controls = Array.from(box.children).filter((child) => {
        return child.matches?.("input,select,button,a") ||
          child.querySelector?.("input,select,button,a");
      });

      const text = textOf(box);
      const looksLikeControls =
        /filter|date|vessel|chapter|refresh|clear|export|search|company/i.test(text) &&
        controls.length >= 2;

      if (!looksLikeControls) return;

      box.classList.add("csvb-poststats-control-row");
      box.dataset.csvbPoststatsControls = "1";
    });
  }

  function wrapTables() {
    document.querySelectorAll("table").forEach((table) => {
      if (table.closest(".csvb-poststats-table-wrap")) return;

      const wrap = document.createElement("div");
      wrap.className = "csvb-poststats-table-wrap";

      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  function addActionGroups() {
    document.querySelectorAll("td, .actions, .buttonRow, .toolbar").forEach((box) => {
      if (box.querySelector(":scope > .csvb-poststats-actions")) return;

      const buttons = Array.from(box.querySelectorAll("button,a.btn,a.btn2,a.button")).filter((b) => {
        return /open|view|export|download|clear|refresh|details|filter/i.test(textOf(b));
      });

      if (buttons.length < 2) return;

      const wrap = document.createElement("div");
      wrap.className = "csvb-poststats-actions";

      box.insertBefore(wrap, buttons[0]);
      buttons.forEach((b) => wrap.appendChild(b));
    });
  }

  function addTooltips() {
    const rules = [
      [/refresh/i, "Reload the latest post-inspection statistics from the database."],
      [/clear/i, "Clear the active filters."],
      [/export/i, "Export the current statistics or table view."],
      [/download/i, "Download the current report or exported file."],
      [/open|view/i, "Open the selected inspection, observation, or detail view."],
      [/filter/i, "Apply the selected filters to the statistics."],
      [/dashboard/i, "Return to the dashboard."],
      [/mode selection/i, "Return to mode selection."],
      [/logout/i, "Sign out of the current session."]
    ];

    document.querySelectorAll("button,a.btn,a.btn2,a.button").forEach((el) => {
      if (el.getAttribute("data-csvb-help")) return;

      const t = textOf(el);
      const rule = rules.find(([rx]) => rx.test(t));

      if (rule) {
        el.setAttribute("data-csvb-help", rule[1]);
        el.setAttribute("title", rule[1]);
      }
    });
  }

  function addSectionIcons() {
    const map = [
      [/kpi|performance/i, "🎯"],
      [/vessel/i, "🚢"],
      [/chapter/i, "📚"],
      [/observation|negative|positive/i, "📝"],
      [/inspector/i, "🧭"],
      [/trend|stat|chart/i, "📈"],
      [/filter/i, "🔎"],
      [/report/i, "📑"]
    ];

    document.querySelectorAll("h1,h2,h3,h4,b,strong").forEach((h) => {
      if (h.dataset.csvbPoststatsIconed === "1") return;

      const t = textOf(h);
      const found = map.find(([rx]) => rx.test(t));
      if (!found) return;

      h.dataset.csvbPoststatsIconed = "1";
      const span = document.createElement("span");
      span.className = "csvb-poststats-icon";
      span.textContent = found[1];

      h.prepend(span);
    });
  }

  function normalizeKpiCards() {
    const likelyCards = Array.from(document.querySelectorAll(".card,.panel,.box,section,div")).filter((el) => {
      const t = textOf(el);
      if (t.length > 80) return false;
      return /total|negative|positive|largely|inspection|observation|vessel|question|kpi/i.test(t) &&
             /\d/.test(t);
    });

    likelyCards.slice(0, 24).forEach((card) => {
      if (card.dataset.csvbPoststatsKpi === "1") return;

      const text = textOf(card);
      if (!text) return;

      card.dataset.csvbPoststatsKpi = "1";
      card.classList.add("csvb-poststats-kpi-card");
    });

    const parentGroups = new Set();

    likelyCards.forEach((card) => {
      if (card.parentElement) parentGroups.add(card.parentElement);
    });

    parentGroups.forEach((parent) => {
      const childKpis = Array.from(parent.children).filter((x) =>
        x.classList?.contains("csvb-poststats-kpi-card")
      );

      if (childKpis.length >= 3) {
        parent.classList.add("csvb-poststats-kpi-grid");
      }
    });
  }

  function polish() {
    mark();
    addHelperStrip();
    groupControls();
    wrapTables();
    addActionGroups();
    addTooltips();
    addSectionIcons();
    normalizeKpiCards();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", polish);
  } else {
    polish();
  }

  setTimeout(polish, 700);
  setTimeout(polish, 1800);
  setTimeout(polish, 3500);
})();
JS

node <<'NODE'
const fs = require("fs");

function inject(file) {
  if (!fs.existsSync(file)) return;

  let html = fs.readFileSync(file, "utf8");

  const cssTag = '<link rel="stylesheet" href="./csvb-post-inspection-stats-polish.css?v=20260430_1" />';
  const jsTag = '<script src="./csvb-post-inspection-stats-polish.js?v=20260430_1"></script>';

  if (!html.includes("csvb-post-inspection-stats-polish.css")) {
    html = html.includes("</head>")
      ? html.replace("</head>", `  ${cssTag}\n</head>`)
      : cssTag + "\n" + html;
  }

  if (!html.includes("csvb-post-inspection-stats-polish.js")) {
    html = html.includes("</body>")
      ? html.replace("</body>", `  ${jsTag}\n</body>`)
      : html + "\n" + jsTag + "\n";
  }

  fs.writeFileSync(file, html, "utf8");
}

inject("public/post_inspection_stats.html");
inject("public/post_inspection_kpis.html");

const sw = "public/service-worker.js";
if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v40-mc10d5-post-inspection-stats-polish";'
    );
  }

  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC10D5_POST_INSPECTION_STATS_POLISH_APPLIED.txt",
  "MC-10D5 applied: Post-Inspection Stats/KPIs visual polish, helper strip, compact controls, icons, tooltips.\\n",
  "utf8"
);

console.log("DONE: MC-10D5 Post-Inspection Stats polish applied.");
NODE

echo "DONE: MC-10D5 completed."
echo "Next: open post_inspection_stats.html and hard refresh with Ctrl + Shift + R."
