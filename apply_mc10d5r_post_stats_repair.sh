#!/usr/bin/env bash
set -e

if [ ! -f "public/post_inspection_stats.html" ]; then
  echo "ERROR: public/post_inspection_stats.html not found."
  exit 1
fi

mkdir -p backup_before_mc10d5r_post_stats_repair

for f in \
  public/post_inspection_stats.html \
  public/csvb-post-stats-repair.css \
  public/csvb-post-stats-repair.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" "backup_before_mc10d5r_post_stats_repair/$(basename "$f")"
  fi
done

cat > public/csvb-post-stats-repair.css <<'CSS'
/* MC-10D5R
   Post-Inspection Stats targeted repair:
   - close Vessel dropdown by default
   - PGNO analytics vertical stacked rows
*/

html[data-csvb-page="post_inspection_stats.html"] .csvb-force-hidden,
html[data-csvb-page="post_inspection_stats.html"] [data-csvb-dropdown-forced-hidden="1"]{
  display:none !important;
  visibility:hidden !important;
  opacity:0 !important;
  pointer-events:none !important;
}

/* Keep dropdown panels compact and above content only when intentionally open */
html[data-csvb-page="post_inspection_stats.html"] .csvb-filter-dropdown-panel{
  position:absolute !important;
  z-index:5000 !important;
  max-height:320px !important;
  overflow:auto !important;
}

/* PGNO analytics section: stack items vertically */
html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-vertical-list,
html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-vertical-list > *,
html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-row{
  max-width:100% !important;
  box-sizing:border-box !important;
}

/* Container becomes a vertical list */
html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-vertical-list{
  display:flex !important;
  flex-direction:column !important;
  align-items:stretch !important;
  gap:6px !important;
}

/* Each PGNO item remains horizontal */
html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-row{
  display:grid !important;
  grid-template-columns:minmax(220px, 1fr) auto auto !important;
  gap:10px !important;
  align-items:center !important;
  width:100% !important;
  padding:6px 8px !important;
  border-bottom:1px solid #D6E4F5 !important;
  background:transparent !important;
}

/* Text part */
html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-row-title{
  min-width:0 !important;
  overflow:hidden !important;
  text-overflow:ellipsis !important;
  white-space:nowrap !important;
}

/* Count part */
html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-row-metrics{
  white-space:nowrap !important;
  font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  font-size:.9rem !important;
}

/* Button part */
html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-row-actions{
  white-space:nowrap !important;
  display:flex !important;
  justify-content:flex-end !important;
  gap:6px !important;
}

html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-row-actions button,
html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-row-actions a{
  padding:6px 10px !important;
  white-space:nowrap !important;
}

/* If an existing blue separator is present, make it a normal small separator */
html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-separator{
  width:3px !important;
  min-width:3px !important;
  height:18px !important;
  border-radius:99px !important;
  background:#1976D2 !important;
  display:inline-block !important;
  margin:0 6px !important;
}

/* Make smaller PGNO boxes stack cleanly too */
html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-box-vertical{
  display:flex !important;
  flex-direction:column !important;
  gap:6px !important;
  align-items:stretch !important;
}

/* Prevent PGNO item content from spreading into many columns */
html[data-csvb-page="post_inspection_stats.html"] [data-csvb-pgno-normalized="1"]{
  width:100% !important;
}

/* Responsive fallback */
@media(max-width:900px){
  html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-row{
    grid-template-columns:1fr !important;
    gap:5px !important;
  }

  html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-row-title{
    white-space:normal !important;
  }

  html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-row-actions{
    justify-content:flex-start !important;
  }
}
CSS

cat > public/csvb-post-stats-repair.js <<'JS'
// MC-10D5R
// Post-Inspection Stats targeted repair:
// - close vessel dropdown on load/outside click
// - normalize PGNO analytics into vertical stacked rows
// Visual/helper only.

(() => {
  "use strict";

  const BUILD = "MC10D5R-2026-04-30";

  function pageName() {
    return String(window.location.pathname || "").split("/").pop() || "";
  }

  function mark() {
    window.CSVB_POST_STATS_REPAIR_BUILD = BUILD;
    document.documentElement.setAttribute("data-csvb-page", pageName());
    document.documentElement.setAttribute("data-csvb-poststats-repair", BUILD);
  }

  function textOf(el) {
    return String(el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function looksLikeVesselDropdownPanel(el) {
    if (!el || el === document.body || el === document.documentElement) return false;

    const text = textOf(el);
    if (!text) return false;

    const hasChecks = el.querySelectorAll('input[type="checkbox"]').length >= 2;
    const hasVesselNames = /GOOD SHIP|OLYMPIC|VESSEL|SHIP/i.test(text);
    const hasAllNone = /All|None/i.test(text);

    return hasChecks && hasVesselNames && hasAllNone;
  }

  function findVesselDropdownPanels() {
    return Array.from(document.querySelectorAll("div, section, ul, form")).filter(looksLikeVesselDropdownPanel);
  }

  function closeDropdownPanel(panel) {
    if (!panel) return;
    panel.setAttribute("data-csvb-dropdown-forced-hidden", "1");
    panel.classList.add("csvb-force-hidden");
  }

  function openDropdownPanel(panel) {
    if (!panel) return;
    panel.removeAttribute("data-csvb-dropdown-forced-hidden");
    panel.classList.remove("csvb-force-hidden");
    panel.classList.add("csvb-filter-dropdown-panel");
  }

  function closeAllVesselDropdowns() {
    findVesselDropdownPanels().forEach(closeDropdownPanel);
  }

  function wireVesselDropdowns() {
    const panels = findVesselDropdownPanels();

    panels.forEach((panel) => {
      panel.classList.add("csvb-filter-dropdown-panel");
      closeDropdownPanel(panel);
    });

    const possibleButtons = Array.from(document.querySelectorAll("button, .btn, .filter, .filterBtn, select, div, span")).filter((el) => {
      const t = textOf(el);
      return /Vessels?:\s*all|Vessel\(s\)|Vessels/i.test(t) && !looksLikeVesselDropdownPanel(el);
    });

    possibleButtons.forEach((btn) => {
      if (btn.dataset.csvbVesselDropBound === "1") return;
      btn.dataset.csvbVesselDropBound = "1";

      btn.addEventListener("click", (ev) => {
        const freshPanels = findVesselDropdownPanels();

        if (!freshPanels.length) return;

        const anyVisible = freshPanels.some((p) => {
          const cs = window.getComputedStyle(p);
          return cs.display !== "none" && !p.classList.contains("csvb-force-hidden");
        });

        freshPanels.forEach((p) => {
          if (anyVisible) closeDropdownPanel(p);
          else openDropdownPanel(p);
        });

        ev.stopPropagation();
      });
    });

    document.addEventListener("click", (ev) => {
      const target = ev.target;

      if (target.closest?.(".csvb-filter-dropdown-panel")) return;

      const isVesselButton = Array.from(possibleButtons).some((b) => b.contains(target));
      if (isVesselButton) return;

      closeAllVesselDropdowns();
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closeAllVesselDropdowns();
    });
  }

  function likelyPgnoSection(el) {
    const t = textOf(el);
    return /PGNO Analytics|Top PGNO|PGNO by Question|Missing PGNO Trend/i.test(t);
  }

  function normalizePgnoRowsInBox(box) {
    if (!box || box.dataset.csvbPgnoBoxDone === "1") return;

    const buttons = Array.from(box.querySelectorAll("button, a")).filter((x) => /^View$/i.test(textOf(x)));
    if (!buttons.length) return;

    box.dataset.csvbPgnoBoxDone = "1";
    box.classList.add("csvb-pgno-box-vertical");

    buttons.forEach((btn) => {
      if (btn.closest(".csvb-pgno-row")) return;

      const parent = btn.parentElement;
      if (!parent) return;

      const row = document.createElement("div");
      row.className = "csvb-pgno-row";
      row.setAttribute("data-csvb-pgno-normalized", "1");

      const rawText = textOf(parent);
      const noButtonText = rawText.replace(/\bView\b/g, "").trim();

      let titleText = noButtonText;
      let metricsText = "";

      const match = noButtonText.match(/^(.*?)(\d+\s*\/\s*\d+\s*\/\s*[\d.]+)\s*$/);
      if (match) {
        titleText = match[1].trim();
        metricsText = match[2].trim();
      }

      const title = document.createElement("div");
      title.className = "csvb-pgno-row-title";
      title.textContent = titleText || noButtonText;

      const metrics = document.createElement("div");
      metrics.className = "csvb-pgno-row-metrics";
      metrics.textContent = metricsText;

      const actions = document.createElement("div");
      actions.className = "csvb-pgno-row-actions";

      parent.insertBefore(row, parent.firstChild);
      row.appendChild(title);
      row.appendChild(metrics);
      row.appendChild(actions);
      actions.appendChild(btn);

      btn.setAttribute("data-csvb-help", "Open the detailed records behind this PGNO statistic.");
      btn.setAttribute("title", "Open the detailed records behind this PGNO statistic.");
    });

    Array.from(box.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "|") {
        const sep = document.createElement("span");
        sep.className = "csvb-pgno-separator";
        node.replaceWith(sep);
      }
    });
  }

  function normalizePgnoAnalytics() {
    const sections = Array.from(document.querySelectorAll("section, .panel, .card, .box, div")).filter(likelyPgnoSection);

    sections.forEach((section) => {
      section.classList.add("csvb-pgno-vertical-list");

      const boxes = Array.from(section.querySelectorAll(".card, .box, .panel, div")).filter((box) => {
        const t = textOf(box);
        return /PGNO|Obs\s*\/\s*Insp|Avg|View/i.test(t) && box.querySelector("button, a");
      });

      if (boxes.length) {
        boxes.forEach(normalizePgnoRowsInBox);
      } else {
        normalizePgnoRowsInBox(section);
      }
    });
  }

  function repair() {
    mark();
    wireVesselDropdowns();
    normalizePgnoAnalytics();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", repair);
  } else {
    repair();
  }

  setTimeout(repair, 700);
  setTimeout(repair, 1800);
  setTimeout(repair, 3500);
})();
JS

node <<'NODE'
const fs = require("fs");

const files = [
  "public/post_inspection_stats.html",
  "public/post_inspection_kpis.html"
];

for (const htmlFile of files) {
  if (!fs.existsSync(htmlFile)) continue;

  let html = fs.readFileSync(htmlFile, "utf8");

  const cssTag = '<link rel="stylesheet" href="./csvb-post-stats-repair.css?v=20260430_1" />';
  const jsTag = '<script src="./csvb-post-stats-repair.js?v=20260430_1"></script>';

  if (!html.includes("csvb-post-stats-repair.css")) {
    html = html.replace("</head>", `  ${cssTag}\n</head>`);
  }

  if (!html.includes("csvb-post-stats-repair.js")) {
    html = html.replace("</body>", `  ${jsTag}\n</body>`);
  }

  fs.writeFileSync(htmlFile, html, "utf8");
}

const swFile = "public/service-worker.js";
if (fs.existsSync(swFile)) {
  let sw = fs.readFileSync(swFile, "utf8");
  if (/const CACHE_VERSION = "[^"]+";/.test(sw)) {
    sw = sw.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v41-mc10d5r-post-stats-repair";'
    );
  }
  fs.writeFileSync(swFile, sw, "utf8");
}

fs.writeFileSync(
  "public/MC10D5R_POST_STATS_REPAIR_APPLIED.txt",
  "MC-10D5R applied: post-inspection stats vessel dropdown and PGNO vertical row repair.\n",
  "utf8"
);

console.log("DONE: MC-10D5R applied.");
NODE

echo "DONE: MC-10D5R completed."
echo "Hard refresh post_inspection_stats.html with Ctrl + Shift + R"
