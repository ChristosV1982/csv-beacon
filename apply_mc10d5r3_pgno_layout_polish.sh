#!/usr/bin/env bash
set -e

if [ ! -f "public/post_inspection_stats.html" ]; then
  echo "ERROR: public/post_inspection_stats.html not found."
  exit 1
fi

mkdir -p backup_before_mc10d5r3_pgno_layout_polish

for f in \
  public/post_inspection_stats.html \
  public/csvb-post-stats-pgno-layout.css \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" "backup_before_mc10d5r3_pgno_layout_polish/$(basename "$f")"
  fi
done

cat > public/csvb-post-stats-pgno-layout.css <<'CSS'
/* MC-10D5R3
   PGNO analytics layout polish only
   Safe CSS-only enhancement
*/

/* =========================================================
   1) Make the PGNO analytics chart area full-width
   ========================================================= */
.chartGrid:has(#chartPgno):has(#chartPgnoQuestion):has(#chartPgnoMissing) {
  display: grid !important;
  grid-template-columns: 1fr !important;
  gap: 14px !important;
  align-items: stretch !important;
  width: 100% !important;
}

.chartGrid:has(#chartPgno):has(#chartPgnoQuestion):has(#chartPgnoMissing) > .chartBox {
  width: 100% !important;
  max-width: none !important;
  min-height: 0 !important;
  box-sizing: border-box !important;
}

/* =========================================================
   2) PGNO custom list renderer:
      each item horizontal, stacked vertically
   ========================================================= */
#chartPgno .csvb-pgno-list-chart,
#chartPgnoQuestion .csvb-pgno-list-chart,
#chartPgnoMissing .csvb-pgno-list-chart {
  display: flex !important;
  flex-direction: column !important;
  gap: 0 !important;
  width: 100% !important;
  max-width: 100% !important;
}

#chartPgno .csvb-pgno-list-row,
#chartPgnoQuestion .csvb-pgno-list-row,
#chartPgnoMissing .csvb-pgno-list-row {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 170px 88px !important;
  gap: 12px !important;
  align-items: start !important;
  width: 100% !important;
  padding: 8px 10px !important;
  border-bottom: 1px solid #D6E4F5 !important;
  box-sizing: border-box !important;
}

#chartPgno .csvb-pgno-list-title,
#chartPgnoQuestion .csvb-pgno-list-title,
#chartPgnoMissing .csvb-pgno-list-title {
  min-width: 0 !important;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: unset !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
  line-height: 1.35 !important;
  color: #062A5E !important;
}

#chartPgno .csvb-pgno-list-metrics,
#chartPgnoQuestion .csvb-pgno-list-metrics,
#chartPgnoMissing .csvb-pgno-list-metrics {
  white-space: nowrap !important;
  text-align: right !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  color: #163457 !important;
  padding-top: 2px !important;
}

#chartPgno .csvb-pgno-list-actions,
#chartPgnoQuestion .csvb-pgno-list-actions,
#chartPgnoMissing .csvb-pgno-list-actions {
  display: flex !important;
  justify-content: flex-end !important;
  align-items: start !important;
}

#chartPgno .csvb-pgno-list-actions button,
#chartPgnoQuestion .csvb-pgno-list-actions button,
#chartPgnoMissing .csvb-pgno-list-actions button {
  white-space: nowrap !important;
  padding: 6px 12px !important;
}

/* =========================================================
   3) Improve the PGNO table width / first column
   ========================================================= */
table:has(#pgnoTableTbody) {
  width: 100% !important;
  table-layout: auto !important;
}

table:has(#pgnoTableTbody) th:first-child,
table:has(#pgnoTableTbody) td:first-child {
  width: 58% !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: break-word !important;
  vertical-align: top !important;
}

table:has(#pgnoTableTbody) th:last-child,
table:has(#pgnoTableTbody) td:last-child {
  white-space: nowrap !important;
}

#pgnoTableTbody td {
  vertical-align: top !important;
}

/* =========================================================
   4) Smaller screens
   ========================================================= */
@media (max-width: 1100px) {
  #chartPgno .csvb-pgno-list-row,
  #chartPgnoQuestion .csvb-pgno-list-row,
  #chartPgnoMissing .csvb-pgno-list-row {
    grid-template-columns: minmax(0, 1fr) 150px 84px !important;
  }
}

@media (max-width: 820px) {
  #chartPgno .csvb-pgno-list-row,
  #chartPgnoQuestion .csvb-pgno-list-row,
  #chartPgnoMissing .csvb-pgno-list-row {
    grid-template-columns: 1fr !important;
    gap: 6px !important;
  }

  #chartPgno .csvb-pgno-list-metrics,
  #chartPgnoQuestion .csvb-pgno-list-metrics,
  #chartPgnoMissing .csvb-pgno-list-metrics {
    text-align: left !important;
  }

  #chartPgno .csvb-pgno-list-actions,
  #chartPgnoQuestion .csvb-pgno-list-actions,
  #chartPgnoMissing .csvb-pgno-list-actions {
    justify-content: flex-start !important;
  }

  table:has(#pgnoTableTbody) th:first-child,
  table:has(#pgnoTableTbody) td:first-child {
    width: auto !important;
  }
}
CSS

node <<'NODE'
const fs = require("fs");

const htmlFile = "public/post_inspection_stats.html";
let html = fs.readFileSync(htmlFile, "utf8");

const cssTag = '<link rel="stylesheet" href="./csvb-post-stats-pgno-layout.css?v=20260430_1" />';

if (!html.includes("csvb-post-stats-pgno-layout.css")) {
  html = html.replace("</head>", `  ${cssTag}\n</head>`);
}

fs.writeFileSync(htmlFile, html, "utf8");

/* service worker cache bump */
const swFile = "public/service-worker.js";
if (fs.existsSync(swFile)) {
  let sw = fs.readFileSync(swFile, "utf8");
  if (/const CACHE_VERSION = "[^"]+";/.test(sw)) {
    sw = sw.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v44-mc10d5r3-pgno-layout-polish";'
    );
    fs.writeFileSync(swFile, sw, "utf8");
  }
}

fs.writeFileSync(
  "public/MC10D5R3_PGNO_LAYOUT_POLISH_APPLIED.txt",
  "MC-10D5R3 applied: PGNO analytics full-width stacked horizontal layout.\n",
  "utf8"
);

console.log("DONE: MC-10D5R3 PGNO layout polish applied.");
NODE

echo "DONE: MC-10D5R3 completed."
echo "Now hard refresh with Ctrl + Shift + R"
