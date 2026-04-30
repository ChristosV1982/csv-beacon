#!/usr/bin/env bash
set -e

if [ ! -f "public/post_inspection_stats.html" ]; then
  echo "ERROR: public/post_inspection_stats.html not found."
  exit 1
fi

mkdir -p backup_before_mc10d5_s2b_pgno_final_css_fix

for f in \
  public/post_inspection_stats.html \
  public/csvb-post-stats-pgno-final.css \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" "backup_before_mc10d5_s2b_pgno_final_css_fix/$(basename "$f")"
  fi
done

cat > public/csvb-post-stats-pgno-final.css <<'CSS'
/* public/csvb-post-stats-pgno-final.css
   C.S.V. BEACON — MC-10D5-S2B
   PGNO Analytics final layout repair.

   CSS only.
   Targets confirmed structure:
   #chartPgno / #chartPgnoQuestion / #chartPgnoMissing
   .barRow / .barLabel / .barTrack / .barValue
   #pgnoTableTbody
*/

/* ------------------------------------------------------------
   1. PGNO Analytics chart boxes use full page width
------------------------------------------------------------ */

html[data-csvb-page="post_inspection_stats.html"] .chartGrid:has(#chartPgno),
html[data-csvb-page="post_inspection_stats.html"] .chartGrid:has(#chartPgnoQuestion),
html[data-csvb-page="post_inspection_stats.html"] .chartGrid:has(#chartPgnoMissing) {
  display: grid !important;
  grid-template-columns: 1fr !important;
  gap: 10px !important;
  width: 100% !important;
  max-width: 100% !important;
}

html[data-csvb-page="post_inspection_stats.html"] .chartBox:has(#chartPgno),
html[data-csvb-page="post_inspection_stats.html"] .chartBox:has(#chartPgnoQuestion),
html[data-csvb-page="post_inspection_stats.html"] .chartBox:has(#chartPgnoMissing) {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
  min-height: 0 !important;
}

/* ------------------------------------------------------------
   2. PGNO bar chart rows become stacked horizontal rows
------------------------------------------------------------ */

html[data-csvb-page="post_inspection_stats.html"] #chartPgno,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing {
  width: 100% !important;
  max-width: 100% !important;
}

html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barRow,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barRow,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barRow {
  display: grid !important;
  grid-template-columns: minmax(0, 1fr) 8px 150px 76px !important;
  gap: 10px !important;
  align-items: start !important;
  width: 100% !important;
  max-width: 100% !important;
  padding: 7px 8px !important;
  border-bottom: 1px solid #D6E4F5 !important;
  box-sizing: border-box !important;
}

/* Full PGNO text visible */
html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barLabel,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barLabel,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barLabel {
  min-width: 0 !important;
  width: auto !important;
  max-width: 100% !important;
  white-space: normal !important;
  overflow: visible !important;
  text-overflow: unset !important;
  overflow-wrap: anywhere !important;
  word-break: normal !important;
  line-height: 1.32 !important;
  color: #062A5E !important;
}

/* Keep the blue indicator, but make it a slim separator, not a wide bar */
html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barTrack,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barTrack,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barTrack {
  width: 4px !important;
  min-width: 4px !important;
  max-width: 4px !important;
  height: 20px !important;
  margin-top: 1px !important;
  border-radius: 999px !important;
  background: #DCEBFA !important;
  overflow: hidden !important;
}

html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barFill,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barFill,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barFill {
  width: 100% !important;
  min-width: 100% !important;
  height: 100% !important;
  border-radius: 999px !important;
}

/* Obs / Insp / Avg stays horizontal */
html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barValue,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barValue,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barValue {
  white-space: nowrap !important;
  text-align: right !important;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace !important;
  line-height: 1.25 !important;
  padding-top: 1px !important;
  color: #163457 !important;
}

/* View button stays at far right */
html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barRow > div:last-child,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barRow > div:last-child,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barRow > div:last-child {
  display: flex !important;
  justify-content: flex-end !important;
  align-items: flex-start !important;
  min-width: 0 !important;
}

html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barRow > div:last-child button,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barRow > div:last-child button,
html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barRow > div:last-child button {
  white-space: nowrap !important;
  padding: 5px 10px !important;
}

/* ------------------------------------------------------------
   3. PGNO table should use full width and show PGNO text
------------------------------------------------------------ */

html[data-csvb-page="post_inspection_stats.html"] section:has(#pgnoTableTbody),
html[data-csvb-page="post_inspection_stats.html"] .panel:has(#pgnoTableTbody),
html[data-csvb-page="post_inspection_stats.html"] .card:has(#pgnoTableTbody),
html[data-csvb-page="post_inspection_stats.html"] div:has(> table #pgnoTableTbody) {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 0 !important;
}

html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) {
  width: 100% !important;
  max-width: 100% !important;
  min-width: 1100px !important;
  table-layout: fixed !important;
}

html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) th:nth-child(1),
html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) td:nth-child(1) {
  width: 58% !important;
  white-space: normal !important;
  overflow-wrap: anywhere !important;
  word-break: normal !important;
  vertical-align: top !important;
}

html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) th:nth-child(2),
html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) td:nth-child(2),
html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) th:nth-child(3),
html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) td:nth-child(3),
html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) th:nth-child(4),
html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) td:nth-child(4),
html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) th:nth-child(5),
html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) td:nth-child(5),
html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) th:nth-child(6),
html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) td:nth-child(6) {
  white-space: nowrap !important;
  vertical-align: top !important;
}

/* ------------------------------------------------------------
   4. Responsive fallback
------------------------------------------------------------ */

@media (max-width: 1100px) {
  html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barRow,
  html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barRow,
  html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barRow {
    grid-template-columns: minmax(0, 1fr) 6px 130px 74px !important;
    gap: 8px !important;
  }
}

@media (max-width: 780px) {
  html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barRow,
  html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barRow,
  html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barRow {
    grid-template-columns: 1fr !important;
    gap: 5px !important;
  }

  html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barValue,
  html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barValue,
  html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barValue {
    text-align: left !important;
  }

  html[data-csvb-page="post_inspection_stats.html"] #chartPgno .barRow > div:last-child,
  html[data-csvb-page="post_inspection_stats.html"] #chartPgnoQuestion .barRow > div:last-child,
  html[data-csvb-page="post_inspection_stats.html"] #chartPgnoMissing .barRow > div:last-child {
    justify-content: flex-start !important;
  }

  html[data-csvb-page="post_inspection_stats.html"] table:has(#pgnoTableTbody) {
    min-width: 900px !important;
  }
}
CSS

node <<'NODE'
const fs = require("fs");

const htmlFile = "public/post_inspection_stats.html";
let html = fs.readFileSync(htmlFile, "utf8");

const cssTag = '<link rel="stylesheet" href="./csvb-post-stats-pgno-final.css?v=20260430_1" />';

if (!html.includes("csvb-post-stats-pgno-final.css")) {
  html = html.replace("</head>", `  ${cssTag}\n</head>`);
}

fs.writeFileSync(htmlFile, html, "utf8");

const sw = "public/service-worker.js";
if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v48-mc10d5-s2b-pgno-final-css";'
    );
  }

  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC10D5_S2B_PGNO_FINAL_CSS_APPLIED.txt",
  "MC-10D5-S2B applied: PGNO Analytics final CSS-only layout repair.\n",
  "utf8"
);

console.log("DONE: MC-10D5-S2B PGNO final CSS applied.");
NODE

echo "DONE: MC-10D5-S2B completed."
echo "Hard refresh post_inspection_stats.html with Ctrl + Shift + R."
