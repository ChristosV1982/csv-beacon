#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

if [ ! -f "public/q-company.html" ]; then
  echo "ERROR: public/q-company.html not found."
  exit 1
fi

mkdir -p backup_before_mc10d2r_company_builder_layout_repair

for f in \
  public/q-company.html \
  public/csvb-company-builder-layout-repair.css \
  public/csvb-company-builder-layout-repair.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc10d2r_company_builder_layout_repair/$(basename "$f")
  fi
done

cat > public/csvb-company-builder-layout-repair.css <<'CSS'
/* public/csvb-company-builder-layout-repair.css
   C.S.V. BEACON — MC-10D2R
   Company Builder layout repair after 100% zoom fit pass.

   Visual/layout only.
   No database / RLS / auth / business logic changes.
*/

html[data-csvb-page="q-company.html"] body{
  overflow-x:hidden !important;
}

/* Main page uses the full available browser width */
html[data-csvb-page="q-company.html"] main,
html[data-csvb-page="q-company.html"] .wrap,
html[data-csvb-page="q-company.html"] .container,
html[data-csvb-page="q-company.html"] .page,
html[data-csvb-page="q-company.html"] .content{
  width:100% !important;
  max-width:100% !important;
  padding-left:8px !important;
  padding-right:8px !important;
  margin-left:auto !important;
  margin-right:auto !important;
  box-sizing:border-box !important;
}

/* Force the Company Builder primary layout to stack vertically */
html[data-csvb-page="q-company.html"] .csvb-company-builder-reflow,
html[data-csvb-page="q-company.html"] .csvb-company-builder-reflow > *,
html[data-csvb-page="q-company.html"] .csvb-company-builder-reflow-target{
  max-width:100% !important;
  min-width:0 !important;
}

/* Common grid/layout classes on q-company must not squeeze into narrow columns */
html[data-csvb-page="q-company.html"] .grid,
html[data-csvb-page="q-company.html"] .mainGrid,
html[data-csvb-page="q-company.html"] .layout,
html[data-csvb-page="q-company.html"] .contentGrid,
html[data-csvb-page="q-company.html"] .twoCol,
html[data-csvb-page="q-company.html"] .two-column,
html[data-csvb-page="q-company.html"] .columns,
html[data-csvb-page="q-company.html"] .csvb-company-builder-reflow{
  display:grid !important;
  grid-template-columns:1fr !important;
  gap:10px !important;
  width:100% !important;
  max-width:100% !important;
}

/* Panels/cards must use full row width */
html[data-csvb-page="q-company.html"] section,
html[data-csvb-page="q-company.html"] .panel,
html[data-csvb-page="q-company.html"] .card,
html[data-csvb-page="q-company.html"] fieldset,
html[data-csvb-page="q-company.html"] .box{
  width:100% !important;
  max-width:100% !important;
  min-width:0 !important;
  box-sizing:border-box !important;
}

/* Keep the workflow blocks readable */
html[data-csvb-page="q-company.html"] .csvb-company-builder-helper,
html[data-csvb-page="q-company.html"] .csvb-builder-steps,
html[data-csvb-page="q-company.html"] .csvb-effective-library-note{
  max-width:100% !important;
}

/* Make the four guide steps horizontal when width allows */
html[data-csvb-page="q-company.html"] .csvb-builder-steps{
  display:grid !important;
  grid-template-columns:repeat(4, minmax(160px, 1fr)) !important;
  gap:8px !important;
}

@media(max-width:1100px){
  html[data-csvb-page="q-company.html"] .csvb-builder-steps{
    grid-template-columns:repeat(2, minmax(160px, 1fr)) !important;
  }
}

/* Table repair: prevent letter-by-letter vertical wrapping */
html[data-csvb-page="q-company.html"] .csvb-table-fit-wrap,
html[data-csvb-page="q-company.html"] .csvb-qcompany-table-wrap{
  width:100% !important;
  max-width:100% !important;
  overflow-x:auto !important;
}

html[data-csvb-page="q-company.html"] table{
  width:100% !important;
  min-width:900px !important;
  max-width:none !important;
  table-layout:auto !important;
  border-collapse:collapse !important;
}

html[data-csvb-page="q-company.html"] th,
html[data-csvb-page="q-company.html"] td{
  white-space:normal !important;
  word-break:normal !important;
  overflow-wrap:break-word !important;
  line-break:auto !important;
  min-width:72px !important;
  max-width:none !important;
  vertical-align:top !important;
}

/* Give likely title/description/notes columns enough width */
html[data-csvb-page="q-company.html"] th:nth-child(2),
html[data-csvb-page="q-company.html"] td:nth-child(2){
  min-width:170px !important;
}

html[data-csvb-page="q-company.html"] th:nth-child(4),
html[data-csvb-page="q-company.html"] td:nth-child(4){
  min-width:190px !important;
}

html[data-csvb-page="q-company.html"] th:nth-child(7),
html[data-csvb-page="q-company.html"] td:nth-child(7){
  min-width:190px !important;
}

/* Questionnaire table should have enough space for title and notes */
html[data-csvb-page="q-company.html"] table.csvb-qcompany-questionnaires-table{
  min-width:1050px !important;
}

html[data-csvb-page="q-company.html"] table.csvb-qcompany-questionnaires-table th,
html[data-csvb-page="q-company.html"] table.csvb-qcompany-questionnaires-table td{
  overflow-wrap:break-word !important;
}

html[data-csvb-page="q-company.html"] table.csvb-qcompany-questionnaires-table th:nth-child(4),
html[data-csvb-page="q-company.html"] table.csvb-qcompany-questionnaires-table td:nth-child(4){
  min-width:260px !important;
}

html[data-csvb-page="q-company.html"] table.csvb-qcompany-questionnaires-table th:nth-child(7),
html[data-csvb-page="q-company.html"] table.csvb-qcompany-questionnaires-table td:nth-child(7){
  min-width:260px !important;
}

/* Template table action buttons should not become huge */
html[data-csvb-page="q-company.html"] table button{
  max-width:220px !important;
  white-space:normal !important;
}

/* Small marker inserted by JS */
html[data-csvb-page="q-company.html"] .csvb-layout-repair-note{
  margin:6px 0 8px;
  padding:7px 9px;
  border-radius:10px;
  border:1px solid #B8E7C8;
  background:#EAF9EF;
  color:#087334;
  font-weight:500;
  font-size:.88rem;
}
CSS

cat > public/csvb-company-builder-layout-repair.js <<'JS'
// public/csvb-company-builder-layout-repair.js
// C.S.V. BEACON — MC-10D2R Company Builder layout repair.
// Visual/layout only.

(() => {
  "use strict";

  const BUILD = "MC10D2R-2026-04-30";

  function mark() {
    window.CSVB_COMPANY_BUILDER_LAYOUT_REPAIR_BUILD = BUILD;
    document.documentElement.setAttribute("data-csvb-qcompany-layout-repair", BUILD);
  }

  function textOf(el) {
    return String(el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function findMajorContainer() {
    const candidates = Array.from(document.querySelectorAll("main,.wrap,.container,.page,.content,body > div"));

    return candidates.find((el) => {
      const t = textOf(el);
      return (
        /Create Questionnaire/i.test(t) &&
        /Compile Questionnaire/i.test(t) &&
        /Templates/i.test(t) &&
        /Questionnaires/i.test(t)
      );
    }) || document.querySelector("main,.wrap,.container,.page,.content");
  }

  function reflowMainLayout() {
    const c = findMajorContainer();
    if (!c) return;

    c.classList.add("csvb-company-builder-reflow");

    Array.from(c.children || []).forEach((child) => {
      child.classList.add("csvb-company-builder-reflow-target");
    });
  }

  function wrapTables() {
    document.querySelectorAll("table").forEach((table) => {
      if (table.closest(".csvb-qcompany-table-wrap")) return;

      const wrap = document.createElement("div");
      wrap.className = "csvb-qcompany-table-wrap";

      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);

      const t = textOf(table);
      if (/Questionnaires|Status|Vessel|Assigned|Updated|Actions|Notes/i.test(t)) {
        table.classList.add("csvb-qcompany-questionnaires-table");
      }
    });
  }

  function addLayoutNote() {
    if (document.getElementById("csvbQCompanyLayoutRepairNote")) return;

    const anchor =
      Array.from(document.querySelectorAll("section,.panel,.card,div"))
        .find((el) => /Create Questionnaire/i.test(textOf(el)) && /Compile Questionnaire/i.test(textOf(el))) ||
      findMajorContainer();

    if (!anchor) return;

    const note = document.createElement("div");
    note.id = "csvbQCompanyLayoutRepairNote";
    note.className = "csvb-layout-repair-note";
    note.textContent =
      "Layout optimized for 100% browser zoom: creation tools are full-width and questionnaires are listed below.";

    anchor.prepend(note);
  }

  function addButtonHelp() {
    const help = [
      [/Create \+ Open/i, "Create the questionnaire from the selected effective question list and open it immediately."],
      [/Select All Filtered/i, "Select all questions currently visible after filters/search."],
      [/Clear Selected/i, "Remove the current question selection."],
      [/Compile/i, "Replace this template’s question list with the current selected questions."],
      [/Create Questionnaire for Vessel/i, "Create a questionnaire from this template for the selected vessel using the effective company library."],
      [/Open/i, "Open this questionnaire."],
      [/Delete/i, "Delete this questionnaire or item. Use carefully."]
    ];

    document.querySelectorAll("button,a.btn,a.btn2").forEach((btn) => {
      const t = textOf(btn);
      for (const [rx, msg] of help) {
        if (rx.test(t)) {
          btn.setAttribute("data-csvb-help", msg);
          break;
        }
      }
    });
  }

  function repair() {
    mark();
    reflowMainLayout();
    wrapTables();
    addLayoutNote();
    addButtonHelp();
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

const htmlFile = "public/q-company.html";
let html = fs.readFileSync(htmlFile, "utf8");

const cssTag = '<link rel="stylesheet" href="./csvb-company-builder-layout-repair.css?v=20260430_1" />';
const jsTag = '<script src="./csvb-company-builder-layout-repair.js?v=20260430_1"></script>';

if (!html.includes("csvb-company-builder-layout-repair.css")) {
  html = html.includes("</head>")
    ? html.replace("</head>", `  ${cssTag}\n</head>`)
    : cssTag + "\n" + html;
}

if (!html.includes("csvb-company-builder-layout-repair.js")) {
  html = html.includes("</body>")
    ? html.replace("</body>", `  ${jsTag}\n</body>`)
    : html + "\n" + jsTag + "\n";
}

fs.writeFileSync(htmlFile, html, "utf8");

const sw = "public/service-worker.js";
if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v37-mc10d2r-company-builder-layout-repair";'
    );
  }

  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC10D2R_COMPANY_BUILDER_LAYOUT_REPAIR_APPLIED.txt",
  "MC-10D2R applied: Company Builder full-width stacked layout and table wrapping repair for 100% browser zoom. Visual-only.\\n",
  "utf8"
);

console.log("DONE: MC-10D2R Company Builder layout repair applied.");
NODE

echo "DONE: MC-10D2R completed."
echo "Next: open q-company.html and hard refresh with Ctrl + Shift + R."
