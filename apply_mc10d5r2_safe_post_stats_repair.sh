#!/usr/bin/env bash
set -e

if [ ! -f "public/post_inspection_stats.html" ]; then
  echo "ERROR: public/post_inspection_stats.html not found."
  exit 1
fi

if [ ! -f "public/post_inspection_stats.js" ]; then
  echo "ERROR: public/post_inspection_stats.js not found."
  exit 1
fi

mkdir -p backup_before_mc10d5r2_safe_post_stats_repair

for f in \
  public/post_inspection_stats.html \
  public/post_inspection_stats.js \
  public/csvb-post-stats-safe-repair.css \
  public/csvb-post-stats-safe-repair.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" "backup_before_mc10d5r2_safe_post_stats_repair/$(basename "$f")"
  fi
done

cat > public/csvb-post-stats-safe-repair.css <<'CSS'
/* MC-10D5R2
   Safe Post-Inspection Stats repair.
   Targets only confirmed selectors:
   - #vesselDrop
   - #chartPgno
   - #chartPgnoQuestion
   - #chartPgnoMissing
*/

/* Vessel dropdown: closed unless #vesselDrop has .open */
html[data-csvb-page="post_inspection_stats.html"] #vesselDrop:not(.open) > .filterPanel{
  display:none !important;
}

html[data-csvb-page="post_inspection_stats.html"] #vesselDrop.open > .filterPanel{
  display:block !important;
  z-index:5000 !important;
}

/* Keep vessel dropdown panel sane when open */
html[data-csvb-page="post_inspection_stats.html"] #vesselDrop > .filterPanel{
  max-height:320px !important;
  overflow:auto !important;
}

/* PGNO charts: vertical list of horizontal rows */
html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-list-chart{
  display:flex !important;
  flex-direction:column !important;
  align-items:stretch !important;
  gap:0 !important;
  width:100% !important;
  max-width:100% !important;
}

html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-list-row{
  display:grid !important;
  grid-template-columns:minmax(260px, 1fr) 150px 82px !important;
  gap:10px !important;
  align-items:center !important;
  width:100% !important;
  padding:7px 8px !important;
  border-bottom:1px solid #D6E4F5 !important;
  box-sizing:border-box !important;
}

html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-list-title{
  min-width:0 !important;
  white-space:nowrap !important;
  overflow:hidden !important;
  text-overflow:ellipsis !important;
  color:#062A5E !important;
}

html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-list-metrics{
  white-space:nowrap !important;
  font-family:ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  color:#163457 !important;
  text-align:right !important;
}

html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-list-actions{
  display:flex !important;
  justify-content:flex-end !important;
  align-items:center !important;
}

html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-list-actions button{
  white-space:nowrap !important;
  padding:6px 10px !important;
}

html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-list-empty{
  padding:10px !important;
  color:#5E6F86 !important;
}

@media(max-width:900px){
  html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-list-row{
    grid-template-columns:1fr !important;
    gap:5px !important;
  }

  html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-list-title{
    white-space:normal !important;
  }

  html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-list-metrics{
    text-align:left !important;
  }

  html[data-csvb-page="post_inspection_stats.html"] .csvb-pgno-list-actions{
    justify-content:flex-start !important;
  }
}
CSS

cat > public/csvb-post-stats-safe-repair.js <<'JS'
// MC-10D5R2
// Safe Post-Inspection Stats repair.
// Only controls #vesselDrop open/close. Does not hide any parent containers.

(() => {
  "use strict";

  const BUILD = "MC10D5R2-2026-04-30";

  function mark() {
    window.CSVB_POST_STATS_SAFE_REPAIR_BUILD = BUILD;
    document.documentElement.setAttribute("data-csvb-poststats-safe-repair", BUILD);
  }

  function closeVesselDrop() {
    const drop = document.getElementById("vesselDrop");
    if (drop) drop.classList.remove("open");
  }

  function wireVesselDropClose() {
    const drop = document.getElementById("vesselDrop");
    if (!drop || drop.dataset.csvbSafeCloseBound === "1") return;

    drop.dataset.csvbSafeCloseBound = "1";

    // ensure closed after the module has rendered the checkbox list
    closeVesselDrop();

    document.addEventListener("click", (event) => {
      const d = document.getElementById("vesselDrop");
      if (!d) return;

      if (!d.contains(event.target)) {
        d.classList.remove("open");
      }
    }, true);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeVesselDrop();
    });
  }

  function run() {
    mark();
    wireVesselDropClose();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  setTimeout(run, 600);
  setTimeout(closeVesselDrop, 900);
})();
JS

node <<'NODE'
const fs = require("fs");

function findBlockEnd(str, start) {
  const open = str.indexOf("{", start);
  if (open < 0) return -1;

  let depth = 0;
  let quote = null;
  let escape = false;
  let lineComment = false;
  let blockComment = false;

  for (let i = open; i < str.length; i++) {
    const ch = str[i];
    const next = str[i + 1];

    if (lineComment) {
      if (ch === "\n") lineComment = false;
      continue;
    }

    if (blockComment) {
      if (ch === "*" && next === "/") {
        blockComment = false;
        i++;
      }
      continue;
    }

    if (quote) {
      if (escape) {
        escape = false;
        continue;
      }

      if (ch === "\\") {
        escape = true;
        continue;
      }

      if (ch === quote) quote = null;
      continue;
    }

    if (ch === "/" && next === "/") {
      lineComment = true;
      i++;
      continue;
    }

    if (ch === "/" && next === "*") {
      blockComment = true;
      i++;
      continue;
    }

    if (ch === '"' || ch === "'" || ch === "`") {
      quote = ch;
      continue;
    }

    if (ch === "{") depth++;
    if (ch === "}") {
      depth--;
      if (depth === 0) return i + 1;
    }
  }

  return -1;
}

/* Patch post_inspection_stats.js safely:
   Rename original renderBarChart to renderBarChartOriginal,
   then add wrapper that changes only PGNO chart rendering.
*/
const jsFile = "public/post_inspection_stats.js";
let js = fs.readFileSync(jsFile, "utf8");

if (!js.includes("function renderPgnoListChartSafe(")) {
  const marker = "function renderBarChart(containerId, rows, options = {})";
  const idx = js.indexOf(marker);

  if (idx < 0) {
    throw new Error("Could not find renderBarChart function.");
  }

  js = js.slice(0, idx) +
    "function renderBarChartOriginal(containerId, rows, options = {})" +
    js.slice(idx + marker.length);

  const end = findBlockEnd(js, idx);
  if (end < 0) {
    throw new Error("Could not find end of renderBarChartOriginal.");
  }

  const wrapper = `

function renderPgnoListChartSafe(containerId, rows, options = {}) {
  const box = document.getElementById(containerId);
  if (!box) return;

  const list = Array.isArray(rows) ? rows : [];
  const labelFn = options.labelFn || ((r) => r.key || "");
  const obsFn = options.obsFn || ((r) => Number(r.observations || r.observation_count || 0));
  const inspFn = options.inspFn || ((r) => Number(r.inspections || r.report_count || r.reports || 0));
  const limit = Number(options.limit || 50);

  const visible = list
    .filter((r) => Number(obsFn(r) || 0) > 0)
    .slice(0, limit);

  if (!visible.length) {
    box.innerHTML = '<div class="csvb-pgno-list-empty">' + esc(options.emptyText || "No PGNO data for current filters.") + '</div>';
    return;
  }

  box.innerHTML = '<div class="csvb-pgno-list-chart">' + visible.map((r) => {
    const label = String(labelFn(r) || r.key || "").trim();
    const obs = Number(obsFn(r) || 0);
    const insp = Number(inspFn(r) || 0);
    const avg = insp > 0 ? (obs / insp).toFixed(2) : "0.00";

    const title = options.titleFn ? String(options.titleFn(r) || label) : label;
    const drillRows = Array.isArray(r.rows) ? r.rows : [];
    const drillId = typeof registerDrill === "function"
      ? registerDrill(title, drillRows, null, "PGNO analytics drilldown.")
      : "";

    return [
      '<div class="csvb-pgno-list-row">',
        '<div class="csvb-pgno-list-title" title="' + esc(label) + '">' + esc(label) + '</div>',
        '<div class="csvb-pgno-list-metrics">' + esc(obs) + ' / ' + esc(insp) + ' / ' + esc(avg) + '</div>',
        '<div class="csvb-pgno-list-actions">',
          drillId ? '<button class="btn btn-muted btn-small" data-csvb-pgno-drill="' + esc(drillId) + '">View</button>' : '',
        '</div>',
      '</div>'
    ].join("");
  }).join("") + '</div>';

  box.querySelectorAll("[data-csvb-pgno-drill]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-csvb-pgno-drill");
      if (id && typeof openRegisteredDrill === "function") openRegisteredDrill(id);
    });
  });
}

function renderBarChart(containerId, rows, options = {}) {
  if (containerId === "chartPgno" || containerId === "chartPgnoQuestion" || containerId === "chartPgnoMissing") {
    return renderPgnoListChartSafe(containerId, rows, options);
  }

  return renderBarChartOriginal(containerId, rows, options);
}
`;

  js = js.slice(0, end) + wrapper + js.slice(end);
}

fs.writeFileSync(jsFile, js, "utf8");

/* Inject CSS/JS into stats page only */
const htmlFile = "public/post_inspection_stats.html";
let html = fs.readFileSync(htmlFile, "utf8");

const cssTag = '<link rel="stylesheet" href="./csvb-post-stats-safe-repair.css?v=20260430_1" />';
const jsTag = '<script src="./csvb-post-stats-safe-repair.js?v=20260430_1"></script>';

if (!html.includes("csvb-post-stats-safe-repair.css")) {
  html = html.replace("</head>", `  ${cssTag}\n</head>`);
}

if (!html.includes("csvb-post-stats-safe-repair.js")) {
  html = html.replace("</body>", `  ${jsTag}\n</body>`);
}

fs.writeFileSync(htmlFile, html, "utf8");

/* Service worker bump */
const swFile = "public/service-worker.js";
if (fs.existsSync(swFile)) {
  let sw = fs.readFileSync(swFile, "utf8");
  if (/const CACHE_VERSION = "[^"]+";/.test(sw)) {
    sw = sw.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v43-mc10d5r2-safe-post-stats-repair";'
    );
  }
  fs.writeFileSync(swFile, sw, "utf8");
}

fs.writeFileSync(
  "public/MC10D5R2_SAFE_POST_STATS_REPAIR_APPLIED.txt",
  "MC-10D5R2 applied: safe post-inspection stats vessel dropdown close and PGNO vertical list rendering.\n",
  "utf8"
);

console.log("DONE: MC-10D5R2 safe repair applied.");
NODE

echo "DONE: MC-10D5R2 completed."
echo "Hard refresh post_inspection_stats.html with Ctrl + Shift + R"
