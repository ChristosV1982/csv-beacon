#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc10c_100_zoom_fit

for f in \
  public/csvb-100pct-fit.css \
  public/csvb-100pct-fit.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc10c_100_zoom_fit/$(basename "$f")
  fi
done

for f in public/*.html; do
  cp "$f" backup_before_mc10c_100_zoom_fit/$(basename "$f")
done

cat > public/csvb-100pct-fit.css <<'CSS'
/* public/csvb-100pct-fit.css
   C.S.V. BEACON — MC-10C
   100% Browser Zoom Fit / Responsive Density Pass

   Visual-only.
   No database / RLS / auth / business logic changes.
*/

:root{
  --csvb-fit-page-pad: 8px;
  --csvb-fit-gap: 8px;
  --csvb-fit-panel-pad: 9px;
  --csvb-fit-input-pad-y: 6px;
  --csvb-fit-input-pad-x: 8px;
  --csvb-fit-btn-pad-y: 6px;
  --csvb-fit-btn-pad-x: 9px;
  --csvb-fit-radius: 9px;
  --csvb-fit-font: 13.5px;
  --csvb-fit-small-font: 12px;
}

html,
body{
  width:100% !important;
  max-width:100% !important;
  min-width:0 !important;
  overflow-x:hidden !important;
  font-size:var(--csvb-fit-font) !important;
}

body{
  margin:0 !important;
}

*,
*::before,
*::after{
  box-sizing:border-box !important;
}

img,
svg,
canvas,
video{
  max-width:100% !important;
}

/* ------------------------------------------------------------
   1. Global page containers must fit the browser at 100%
------------------------------------------------------------ */

main,
.wrap,
.container,
.page,
.content,
.main,
.dashboardWrap,
.dashboard,
.appWrap,
.adminWrap,
.qa-panel,
.qo-panel{
  width:100% !important;
  max-width:100% !important;
  min-width:0 !important;
  margin-left:auto !important;
  margin-right:auto !important;
  padding-left:var(--csvb-fit-page-pad) !important;
  padding-right:var(--csvb-fit-page-pad) !important;
}

/* Avoid nested full-viewport + padding overflow */
.wrap,
.container,
.page,
.content,
.main,
.dashboardWrap,
.dashboard,
.appWrap,
.adminWrap{
  padding-top:8px !important;
  padding-bottom:8px !important;
}

/* ------------------------------------------------------------
   2. Compact headers / top bars
------------------------------------------------------------ */

header,
.topbar,
.appHeader,
.pageHeader{
  max-width:100% !important;
  min-width:0 !important;
  padding:7px 10px !important;
  gap:8px !important;
  flex-wrap:wrap !important;
}

header *,
.topbar *,
.appHeader *,
.pageHeader *{
  min-width:0 !important;
}

.brand img,
.logo,
header img,
.topbar img{
  max-height:42px !important;
  width:auto !important;
}

/* ------------------------------------------------------------
   3. Compact panels/cards/forms
------------------------------------------------------------ */

.panel,
.card,
.qa-panel,
.qo-panel,
.qa-box,
.qo-box,
.assignmentBox,
fieldset,
section{
  max-width:100% !important;
  min-width:0 !important;
  padding:var(--csvb-fit-panel-pad) !important;
  border-radius:var(--csvb-fit-radius) !important;
}

.grid,
.qa-grid,
.qo-grid,
.assignmentGrid,
.cards,
.dashboardGrid{
  gap:var(--csvb-fit-gap) !important;
  max-width:100% !important;
  min-width:0 !important;
}

/* Let CSS grid columns actually shrink */
.grid > *,
.qa-grid > *,
.qo-grid > *,
.assignmentGrid > *,
.cards > *,
.dashboardGrid > *{
  min-width:0 !important;
}

/* ------------------------------------------------------------
   4. Buttons smaller at 100% browser zoom
------------------------------------------------------------ */

button,
.btn,
.btn2,
.btnSmall,
.qa-btn,
.qo-btn,
.csvb-override-launcher{
  padding:var(--csvb-fit-btn-pad-y) var(--csvb-fit-btn-pad-x) !important;
  border-radius:8px !important;
  line-height:1.12 !important;
  min-height:0 !important;
  white-space:normal !important;
}

button,
.btn,
.btn2,
.qa-btn,
.qo-btn{
  font-size:0.92rem !important;
}

.btnSmall,
button.btnSmall{
  font-size:0.82rem !important;
  padding:4px 7px !important;
}

/* ------------------------------------------------------------
   5. Inputs/selects/textareas fit their parent
------------------------------------------------------------ */

input,
select,
textarea,
.qa-input,
.qa-select,
.qa-textarea,
.qo-input,
.qo-select,
.qo-textarea{
  max-width:100% !important;
  min-width:0 !important;
  padding:var(--csvb-fit-input-pad-y) var(--csvb-fit-input-pad-x) !important;
  border-radius:8px !important;
  font-size:0.92rem !important;
}

textarea{
  min-height:70px !important;
}

/* ------------------------------------------------------------
   6. Tables fit without forcing browser zoom-out
------------------------------------------------------------ */

.table-wrap,
.tableWrapper,
.table-scroll,
.qa-table-wrap,
.qo-table-wrap{
  max-width:100% !important;
  overflow-x:auto !important;
}

table,
.table,
.qa-table,
.qo-table{
  width:100% !important;
  max-width:100% !important;
  border-collapse:collapse !important;
  table-layout:auto !important;
}

th,
td{
  padding:5px 6px !important;
  line-height:1.25 !important;
  word-break:normal !important;
  overflow-wrap:anywhere !important;
}

th{
  white-space:normal !important;
}

td{
  max-width:520px;
}

/* ------------------------------------------------------------
   7. Dashboard cards fit more cards per row
------------------------------------------------------------ */

[data-card]{
  min-width:0 !important;
  padding:10px !important;
}

[data-card] p,
[data-card] .muted{
  margin-top:4px !important;
  margin-bottom:6px !important;
}

/* ------------------------------------------------------------
   8. Questions Editor specific 100% fit
------------------------------------------------------------ */

html[data-csvb-page="q-questions-editor.html"] body{
  font-size:13px !important;
}

/* top filter row */
html[data-csvb-page="q-questions-editor.html"] .wrap,
html[data-csvb-page="q-questions-editor.html"] main,
html[data-csvb-page="q-questions-editor.html"] .page,
html[data-csvb-page="q-questions-editor.html"] .container{
  width:100% !important;
  max-width:100% !important;
  padding-left:7px !important;
  padding-right:7px !important;
}

/* common two-column editor layouts */
html[data-csvb-page="q-questions-editor.html"] .grid,
html[data-csvb-page="q-questions-editor.html"] .editorGrid,
html[data-csvb-page="q-questions-editor.html"] .questionEditorGrid,
html[data-csvb-page="q-questions-editor.html"] .layout,
html[data-csvb-page="q-questions-editor.html"] .mainGrid{
  display:grid !important;
  grid-template-columns:minmax(250px, 320px) minmax(0, 1fr) !important;
  gap:8px !important;
  width:100% !important;
  max-width:100% !important;
}

/* left question list should not consume too much width */
html[data-csvb-page="q-questions-editor.html"] #questionList,
html[data-csvb-page="q-questions-editor.html"] #questionsList,
html[data-csvb-page="q-questions-editor.html"] #questionListBox,
html[data-csvb-page="q-questions-editor.html"] #listBox,
html[data-csvb-page="q-questions-editor.html"] .questionList,
html[data-csvb-page="q-questions-editor.html"] .questionsList{
  max-width:320px !important;
  min-width:0 !important;
}

/* right detail panel must shrink instead of forcing overflow */
html[data-csvb-page="q-questions-editor.html"] #viewPanel,
html[data-csvb-page="q-questions-editor.html"] #editPanel,
html[data-csvb-page="q-questions-editor.html"] #detailsPanel,
html[data-csvb-page="q-questions-editor.html"] .detailPanel,
html[data-csvb-page="q-questions-editor.html"] .questionDetail{
  min-width:0 !important;
  max-width:100% !important;
  overflow-x:hidden !important;
}

/* list cards more compact */
html[data-csvb-page="q-questions-editor.html"] .qCard,
html[data-csvb-page="q-questions-editor.html"] .questionCard,
html[data-csvb-page="q-questions-editor.html"] [data-question-id],
html[data-csvb-page="q-questions-editor.html"] [data-qid]{
  padding:6px 7px !important;
  font-size:0.84rem !important;
  line-height:1.2 !important;
}

/* long question text must wrap inside fields/panels */
html[data-csvb-page="q-questions-editor.html"] input,
html[data-csvb-page="q-questions-editor.html"] textarea,
html[data-csvb-page="q-questions-editor.html"] .readonly-box,
html[data-csvb-page="q-questions-editor.html"] .field,
html[data-csvb-page="q-questions-editor.html"] .box{
  max-width:100% !important;
  min-width:0 !important;
  overflow-wrap:anywhere !important;
}

/* filter chips/buttons */
html[data-csvb-page="q-questions-editor.html"] .fltDD,
html[data-csvb-page="q-questions-editor.html"] .filter,
html[data-csvb-page="q-questions-editor.html"] .filterBtn{
  max-width:100% !important;
  min-width:0 !important;
}

/* ------------------------------------------------------------
   9. Company Builder / Answer page / Admin pages compact
------------------------------------------------------------ */

html[data-csvb-page="q-company.html"] body,
html[data-csvb-page="q-answer.html"] body,
html[data-csvb-page="su-admin.html"] body,
html[data-csvb-page="post_inspection.html"] body,
html[data-csvb-page="post_inspection_detail.html"] body{
  font-size:13px !important;
}

html[data-csvb-page="q-company.html"] .wrap,
html[data-csvb-page="q-answer.html"] .wrap,
html[data-csvb-page="su-admin.html"] .wrap,
html[data-csvb-page="post_inspection.html"] .wrap,
html[data-csvb-page="post_inspection_detail.html"] .wrap{
  max-width:100% !important;
  width:100% !important;
}

/* ------------------------------------------------------------
   10. Emergency horizontal overflow guard
------------------------------------------------------------ */

body > *{
  max-width:100vw !important;
}

pre,
code{
  max-width:100% !important;
  overflow-x:auto !important;
  white-space:pre-wrap !important;
}
CSS

cat > public/csvb-100pct-fit.js <<'JS'
// public/csvb-100pct-fit.js
// C.S.V. BEACON — MC-10C 100% Browser Zoom Fit
// Visual-only.

(() => {
  "use strict";

  const BUILD = "MC10C-2026-04-30";

  function pageName() {
    const p = String(window.location.pathname || "");
    return p.split("/").pop() || "index.html";
  }

  function markPage() {
    window.CSVB_100PCT_FIT_BUILD = BUILD;
    document.documentElement.setAttribute("data-csvb-fit-build", BUILD);
    document.documentElement.setAttribute("data-csvb-page", pageName());
  }

  function wrapWideTables() {
    document.querySelectorAll("table").forEach((table) => {
      if (table.closest(".csvb-table-fit-wrap")) return;

      const wrapper = document.createElement("div");
      wrapper.className = "csvb-table-fit-wrap";
      wrapper.style.maxWidth = "100%";
      wrapper.style.overflowX = "auto";

      table.parentNode.insertBefore(wrapper, table);
      wrapper.appendChild(table);
    });
  }

  function removeInlineMinWidths() {
    document.querySelectorAll("[style]").forEach((el) => {
      const st = el.getAttribute("style") || "";

      if (/min-width\s*:\s*[0-9]{3,}/i.test(st)) {
        el.style.minWidth = "0";
      }

      if (/width\s*:\s*[0-9]{4,}/i.test(st)) {
        el.style.maxWidth = "100%";
      }
    });
  }

  function fit() {
    markPage();
    wrapWideTables();
    removeInlineMinWidths();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", fit);
  } else {
    fit();
  }

  setTimeout(fit, 700);
  setTimeout(fit, 1800);
  setTimeout(fit, 3500);
})();
JS

node <<'NODE'
const fs = require("fs");
const path = require("path");

const cssTag = '<link rel="stylesheet" href="./csvb-100pct-fit.css?v=20260430_1" />';
const jsTag = '<script src="./csvb-100pct-fit.js?v=20260430_1"></script>';

for (const file of fs.readdirSync("public")) {
  if (!file.endsWith(".html")) continue;

  const p = path.join("public", file);
  let html = fs.readFileSync(p, "utf8");

  if (!html.includes("csvb-100pct-fit.css")) {
    if (html.includes("</head>")) {
      html = html.replace("</head>", `  ${cssTag}\n</head>`);
    } else {
      html = cssTag + "\n" + html;
    }
  }

  if (!html.includes("csvb-100pct-fit.js")) {
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
      'const CACHE_VERSION = "v34-mc10c-100pct-fit";'
    );
  }

  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC10C_100PCT_FIT_APPLIED.txt",
  "MC-10C applied: 100% browser zoom fit and responsive density pass. Visual-only.\\n",
  "utf8"
);

console.log("DONE: MC-10C 100% Zoom Fit applied.");
NODE

echo "DONE: MC-10C completed."
echo "Next: hard refresh with Ctrl + Shift + R."
