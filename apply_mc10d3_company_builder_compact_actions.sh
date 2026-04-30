#!/usr/bin/env bash
set -e

if [ ! -f "public/q-company.html" ]; then
  echo "ERROR: public/q-company.html not found."
  exit 1
fi

mkdir -p backup_before_mc10d3_company_builder_compact_actions

for f in \
  public/q-company.html \
  public/csvb-company-builder-compact-actions.css \
  public/csvb-company-builder-compact-actions.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc10d3_company_builder_compact_actions/$(basename "$f")
  fi
done

cat > public/csvb-company-builder-compact-actions.css <<'CSS'
/* public/csvb-company-builder-compact-actions.css
   MC-10D3
   Compact action groups for q-company.html
*/

html[data-csvb-page="q-company.html"] .csvb-inline-actions,
html[data-csvb-page="q-company.html"] .csvb-toolbar-actions,
html[data-csvb-page="q-company.html"] .csvb-template-actions{
  display:flex !important;
  flex-wrap:wrap !important;
  align-items:center !important;
  gap:8px !important;
}

html[data-csvb-page="q-company.html"] .csvb-inline-actions > *,
html[data-csvb-page="q-company.html"] .csvb-toolbar-actions > *,
html[data-csvb-page="q-company.html"] .csvb-template-actions > *{
  margin:0 !important;
}

html[data-csvb-page="q-company.html"] .csvb-toolbar-actions{
  margin-top:8px !important;
  margin-bottom:6px !important;
}

html[data-csvb-page="q-company.html"] .csvb-inline-actions{
  justify-content:flex-start !important;
}

html[data-csvb-page="q-company.html"] td .csvb-inline-actions{
  min-width:260px !important;
}

html[data-csvb-page="q-company.html"] button,
html[data-csvb-page="q-company.html"] .btn,
html[data-csvb-page="q-company.html"] a.btn,
html[data-csvb-page="q-company.html"] a.button{
  padding:7px 12px !important;
  min-height:auto !important;
  line-height:1.2 !important;
}

html[data-csvb-page="q-company.html"] .csvb-inline-actions button,
html[data-csvb-page="q-company.html"] .csvb-inline-actions .btn,
html[data-csvb-page="q-company.html"] .csvb-template-actions button,
html[data-csvb-page="q-company.html"] .csvb-template-actions .btn{
  white-space:nowrap !important;
}

html[data-csvb-page="q-company.html"] .csvb-toolbar-actions button,
html[data-csvb-page="q-company.html"] .csvb-toolbar-actions .btn{
  white-space:nowrap !important;
}

html[data-csvb-page="q-company.html"] table td:last-child,
html[data-csvb-page="q-company.html"] table th:last-child{
  white-space:normal !important;
}

html[data-csvb-page="q-company.html"] .csvb-help-note{
  margin-top:4px !important;
  font-size:.86rem !important;
  opacity:.9 !important;
}

@media (max-width: 900px){
  html[data-csvb-page="q-company.html"] td .csvb-inline-actions{
    min-width:unset !important;
  }

  html[data-csvb-page="q-company.html"] .csvb-inline-actions,
  html[data-csvb-page="q-company.html"] .csvb-toolbar-actions,
  html[data-csvb-page="q-company.html"] .csvb-template-actions{
    gap:6px !important;
  }

  html[data-csvb-page="q-company.html"] .csvb-inline-actions button,
  html[data-csvb-page="q-company.html"] .csvb-template-actions button,
  html[data-csvb-page="q-company.html"] .csvb-toolbar-actions button{
    white-space:normal !important;
  }
}
CSS

cat > public/csvb-company-builder-compact-actions.js <<'JS'
// public/csvb-company-builder-compact-actions.js
// MC-10D3
// Compact button/action grouping for q-company.html

(() => {
  "use strict";

  const BUILD = "MC10D3-2026-04-30";

  function txt(el) {
    return String(el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function mark() {
    window.CSVB_COMPANY_BUILDER_COMPACT_ACTIONS_BUILD = BUILD;
    document.documentElement.setAttribute("data-csvb-company-builder-compact-actions", BUILD);
  }

  function isActionButton(el) {
    const t = txt(el);
    return /Compile|Create Questionnaire|Create \+ Open|Clear Title|Clear Selected|Select All Filtered|Open|Delete/i.test(t);
  }

  function groupButtonsInCell() {
    document.querySelectorAll("td").forEach((td) => {
      const buttons = Array.from(td.querySelectorAll("button, a.btn, a.button")).filter(isActionButton);
      if (buttons.length < 2) return;
      if (td.querySelector(":scope > .csvb-inline-actions")) return;

      const wrap = document.createElement("div");
      wrap.className = "csvb-inline-actions";

      const first = buttons[0];
      td.insertBefore(wrap, first);

      buttons.forEach((btn) => wrap.appendChild(btn));
    });
  }

  function groupToolbarButtons() {
    const allContainers = Array.from(document.querySelectorAll("div, section, fieldset, .panel, .card"));

    allContainers.forEach((box) => {
      const text = txt(box);

      if (!/Compile Questionnaire/i.test(text)) return;
      if (box.querySelector(".csvb-toolbar-actions")) return;

      const candidates = Array.from(box.querySelectorAll("button, a.btn, a.button")).filter((el) => {
        const t = txt(el);
        return /Select All Filtered|Clear Selected|Create \+ Open|Clear Title/i.test(t);
      });

      if (!candidates.length) return;

      const wrap = document.createElement("div");
      wrap.className = "csvb-toolbar-actions";

      const anchor = candidates[0];
      anchor.parentNode.insertBefore(wrap, anchor);
      candidates.forEach((btn) => wrap.appendChild(btn));
    });
  }

  function groupTemplateActions() {
    document.querySelectorAll("table tr").forEach((tr) => {
      const btns = Array.from(tr.querySelectorAll("button, a.btn, a.button")).filter((el) =>
        /Compile|Create Questionnaire for Vessel/i.test(txt(el))
      );

      if (btns.length < 2) return;

      const td = btns[0].closest("td");
      if (!td) return;
      if (td.querySelector(":scope > .csvb-template-actions")) return;

      const wrap = document.createElement("div");
      wrap.className = "csvb-template-actions";
      td.insertBefore(wrap, btns[0]);

      btns.forEach((btn) => wrap.appendChild(btn));
    });
  }

  function addTooltips() {
    const map = [
      [/Select All Filtered/i, "Select all questions currently shown by the active filters."],
      [/Clear Selected/i, "Remove all currently selected questions from the compile set."],
      [/Create \+ Open/i, "Create a questionnaire using the selected questions and open it immediately."],
      [/Clear Title/i, "Clear the questionnaire title field."],
      [/Compile/i, "Replace this template's questions with the current selected question list."],
      [/Create Questionnaire for Vessel/i, "Create a questionnaire for the selected vessel from this template."],
      [/Open/i, "Open this questionnaire."],
      [/Delete/i, "Delete this entry. Use carefully."]
    ];

    document.querySelectorAll("button, a.btn, a.button").forEach((el) => {
      if (el.getAttribute("title")) return;
      const t = txt(el);
      const found = map.find(([rx]) => rx.test(t));
      if (found) el.setAttribute("title", found[1]);
    });
  }

  function run() {
    mark();
    groupButtonsInCell();
    groupToolbarButtons();
    groupTemplateActions();
    addTooltips();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", run);
  } else {
    run();
  }

  setTimeout(run, 700);
  setTimeout(run, 1800);
  setTimeout(run, 3200);
})();
JS

node <<'NODE'
const fs = require("fs");

const htmlFile = "public/q-company.html";
let html = fs.readFileSync(htmlFile, "utf8");

const cssTag = '<link rel="stylesheet" href="./csvb-company-builder-compact-actions.css?v=20260430_1" />';
const jsTag = '<script src="./csvb-company-builder-compact-actions.js?v=20260430_1"></script>';

if (!html.includes("csvb-company-builder-compact-actions.css")) {
  html = html.replace("</head>", `  ${cssTag}\n</head>`);
}

if (!html.includes("csvb-company-builder-compact-actions.js")) {
  html = html.replace("</body>", `  ${jsTag}\n</body>`);
}

fs.writeFileSync(htmlFile, html, "utf8");

const swFile = "public/service-worker.js";
if (fs.existsSync(swFile)) {
  let sw = fs.readFileSync(swFile, "utf8");
  if (/const CACHE_VERSION = "[^"]+";/.test(sw)) {
    sw = sw.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v38-mc10d3-company-builder-compact-actions";'
    );
  }
  fs.writeFileSync(swFile, sw, "utf8");
}

fs.writeFileSync(
  "public/MC10D3_COMPANY_BUILDER_COMPACT_ACTIONS_APPLIED.txt",
  "MC-10D3 applied: compact action groups and tooltip polish for Company Builder.\n",
  "utf8"
);

console.log("DONE: MC-10D3 applied.");
NODE

echo "DONE: MC-10D3 completed."
echo "Hard refresh q-company.html with Ctrl + Shift + R"
