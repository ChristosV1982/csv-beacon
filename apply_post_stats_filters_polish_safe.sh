#!/usr/bin/env bash
set -euo pipefail

echo "Creating backups..."
ts=$(date +%Y%m%d_%H%M%S)

cp public/post_inspection_stats.js "public/post_inspection_stats.js.bak_${ts}"
cp public/csvb-post-inspection-stats-polish.css "public/csvb-post-inspection-stats-polish.css.bak_${ts}"

node <<'NODE'
const fs = require("fs");

/* =========================
   1) JS: safe dropdown fix
   ========================= */
const jsFile = "public/post_inspection_stats.js";
let js = fs.readFileSync(jsFile, "utf8");

const bindRegex = /function bindDropdown\(dropId,\s*btnId\)\s*\{[\s\S]*?\n\}\s*\n\s*function closeAllDropdowns\(\)\s*\{/;

if (!bindRegex.test(js)) {
  throw new Error("Could not locate bindDropdown()/closeAllDropdowns() block safely.");
}

js = js.replace(
  bindRegex,
`function bindDropdown(dropId, btnId) {
  const drop = safeEl(dropId);
  const btn = safeEl(btnId);
  if (!drop || !btn) return;

  const panel = drop.querySelector(".filterPanel");

  // Always start closed
  drop.classList.remove("open");

  btn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();

    const isOpen = drop.classList.contains("open");
    closeAllDropdowns();

    if (!isOpen) {
      drop.classList.add("open");
    }
  });

  if (panel) {
    panel.addEventListener("click", (e) => {
      e.stopPropagation();
    });
  }
}

function closeAllDropdowns() {`
);

/* optional extra: ensure they are closed immediately after binding */
js = js.replace(
  `  bindDropdown("recMonthDrop", "recMonthDropBtn");`,
  `  bindDropdown("recMonthDrop", "recMonthDropBtn");
  closeAllDropdowns();`
);

fs.writeFileSync(jsFile, js, "utf8");

/* =========================
   2) CSS: safe visual polish
   ========================= */
const cssFile = "public/csvb-post-inspection-stats-polish.css";
let css = fs.readFileSync(cssFile, "utf8");

const marker = "/* === POST STATS SAFE FILTER POLISH === */";

if (!css.includes(marker)) {
  css += `

${marker}

/* ---- Filter area: tighter layout ---- */
.filterDrop,
.field-small {
  margin-bottom: 6px !important;
}

.filterDrop label,
.field-small label {
  display: block !important;
  margin-bottom: 4px !important;
  font-size: 13px !important;
  font-weight: 600 !important;
  line-height: 1.2 !important;
}

/* Inputs / selects / dropdown buttons */
.filterDropBtn,
.field-small input,
.field-small select,
#modeSel,
#trendYearFilter,
input[type="date"],
select {
  min-height: 34px !important;
  height: 34px !important;
  padding: 6px 10px !important;
  font-size: 14px !important;
  line-height: 1.2 !important;
  border-radius: 10px !important;
}

/* Reduce extra white space in top controls */
.toolbar,
.filters,
.filterRow {
  gap: 8px !important;
}

/* Panel itself */
.filterPanel {
  padding: 8px !important;
  border-radius: 12px !important;
  min-width: 280px !important;
  max-width: 430px !important;
}

/* Small All / None buttons */
.miniBtn {
  min-height: 30px !important;
  height: 30px !important;
  padding: 4px 10px !important;
  font-size: 13px !important;
  border-radius: 10px !important;
}

/* Compact checklist area */
.checkPanel {
  max-height: 230px !important;
  overflow: auto !important;
  padding: 2px !important;
}

/* Each checkbox row */
.checkPanel > div,
.checkPanel label,
.checkRow {
  display: grid !important;
  grid-template-columns: 16px 1fr !important;
  align-items: center !important;
  column-gap: 10px !important;
  padding: 6px 8px !important;
  min-height: 30px !important;
  margin: 0 !important;
}

/* Smaller tick boxes */
.checkPanel input[type="checkbox"],
.filterPanel input[type="checkbox"] {
  width: 14px !important;
  height: 14px !important;
  min-width: 14px !important;
  min-height: 14px !important;
  margin: 0 !important;
  transform: none !important;
  accent-color: #1976d2;
}

/* Checkbox labels less bulky */
.checkPanel span,
.checkPanel label span,
.checkPanel div span {
  font-size: 14px !important;
  line-height: 1.25 !important;
  font-weight: 400 !important;
}

/* Summary/stat cards: slightly tighter without changing layout */
.statCard,
.statBox,
.chartBox,
.panel {
  padding: 10px 12px !important;
}

/* Major action buttons: keep compact */
.btn,
button.btn {
  min-height: 32px !important;
  padding-top: 6px !important;
  padding-bottom: 6px !important;
}

/* Avoid unnecessary oversized gaps in filter area */
.filterNote {
  margin-top: 6px !important;
  margin-bottom: 8px !important;
  font-size: 13px !important;
}
`;
}

fs.writeFileSync(cssFile, css, "utf8");

console.log("Safe filter polish applied successfully.");
NODE

echo "Done."
echo "Now hard refresh the page with Ctrl + Shift + R"
