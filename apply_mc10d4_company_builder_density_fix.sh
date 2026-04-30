#!/usr/bin/env bash
set -e

if [ ! -f "public/q-company.html" ]; then
  echo "ERROR: public/q-company.html not found."
  exit 1
fi

mkdir -p backup_before_mc10d4_company_builder_density_fix

for f in \
  public/q-company.html \
  public/csvb-company-builder-density-fix.css \
  public/csvb-company-builder-density-fix.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" "backup_before_mc10d4_company_builder_density_fix/$(basename "$f")"
  fi
done

cat > public/csvb-company-builder-density-fix.css <<'CSS'
/* MC-10D4
   Company Builder density polish:
   - compact top session/search/refresh area
   - inline template action buttons
*/

html[data-csvb-page="q-company.html"] .csvb-search-refresh-inline{
  display:flex !important;
  align-items:center !important;
  gap:8px !important;
  flex-wrap:wrap !important;
}

html[data-csvb-page="q-company.html"] .csvb-search-refresh-inline input,
html[data-csvb-page="q-company.html"] .csvb-search-refresh-inline input[type="search"]{
  min-width:280px !important;
  width:min(360px, 38vw) !important;
  margin:0 !important;
}

html[data-csvb-page="q-company.html"] .csvb-search-refresh-inline button,
html[data-csvb-page="q-company.html"] .csvb-search-refresh-inline .btn,
html[data-csvb-page="q-company.html"] .csvb-search-refresh-inline a.btn,
html[data-csvb-page="q-company.html"] .csvb-search-refresh-inline a.button{
  margin:0 !important;
  white-space:nowrap !important;
  padding:7px 14px !important;
  line-height:1.2 !important;
}

html[data-csvb-page="q-company.html"] .csvb-session-panel{
  min-height:auto !important;
  padding-top:10px !important;
  padding-bottom:10px !important;
}

html[data-csvb-page="q-company.html"] .csvb-template-actions-inline{
  display:flex !important;
  align-items:center !important;
  gap:10px !important;
  flex-wrap:nowrap !important;
  justify-content:flex-start !important;
}

html[data-csvb-page="q-company.html"] .csvb-template-actions-inline > *{
  margin:0 !important;
}

html[data-csvb-page="q-company.html"] .csvb-template-actions-inline button,
html[data-csvb-page="q-company.html"] .csvb-template-actions-inline .btn,
html[data-csvb-page="q-company.html"] .csvb-template-actions-inline a.btn,
html[data-csvb-page="q-company.html"] .csvb-template-actions-inline a.button{
  white-space:nowrap !important;
  padding:7px 12px !important;
  line-height:1.15 !important;
  display:inline-flex !important;
  align-items:center !important;
  justify-content:center !important;
}

html[data-csvb-page="q-company.html"] td.csvb-template-actions-cell,
html[data-csvb-page="q-company.html"] th.csvb-template-actions-cell{
  white-space:normal !important;
  min-width:360px !important;
}

html[data-csvb-page="q-company.html"] .csvb-template-actions-inline .csvb-btn-secondary{
  opacity:.96;
}

html[data-csvb-page="q-company.html"] .csvb-empty-ghost{
  display:none !important;
}

@media (max-width: 1180px){
  html[data-csvb-page="q-company.html"] .csvb-template-actions-inline{
    flex-wrap:wrap !important;
  }

  html[data-csvb-page="q-company.html"] td.csvb-template-actions-cell,
  html[data-csvb-page="q-company.html"] th.csvb-template-actions-cell{
    min-width:unset !important;
  }
}

@media (max-width: 900px){
  html[data-csvb-page="q-company.html"] .csvb-search-refresh-inline{
    gap:6px !important;
  }

  html[data-csvb-page="q-company.html"] .csvb-search-refresh-inline input,
  html[data-csvb-page="q-company.html"] .csvb-search-refresh-inline input[type="search"]{
    width:min(100%, 420px) !important;
    min-width:220px !important;
  }

  html[data-csvb-page="q-company.html"] .csvb-template-actions-inline{
    flex-wrap:wrap !important;
  }
}
CSS

cat > public/csvb-company-builder-density-fix.js <<'JS'
// MC-10D4
// Compact top controls + inline template actions for q-company.html

(() => {
  "use strict";

  const BUILD = "MC10D4-2026-04-30";

  function textOf(el) {
    return String(el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function setMarkers() {
    document.documentElement.setAttribute("data-csvb-page", "q-company.html");
    window.CSVB_COMPANY_BUILDER_DENSITY_FIX_BUILD = BUILD;
  }

  function findSearchInput() {
    return Array.from(document.querySelectorAll('input, input[type="search"]')).find((el) => {
      const ph = String(el.getAttribute("placeholder") || "").toLowerCase();
      return ph.includes("search title") || ph.includes("search");
    }) || null;
  }

  function findRefreshButton() {
    return Array.from(document.querySelectorAll('button, a.btn, a.button')).find((el) => {
      return /refresh/i.test(textOf(el));
    }) || null;
  }

  function findCommonAncestor(a, b) {
    let p = a?.parentElement || null;
    while (p) {
      if (p.contains(b)) return p;
      p = p.parentElement;
    }
    return null;
  }

  function hideIfNowEmpty(el) {
    if (!el || !el.parentElement) return;
    const hasInput = el.querySelector("input, button, a, select, textarea");
    const hasText = textOf(el).length > 0;
    if (!hasInput && !hasText) {
      el.classList.add("csvb-empty-ghost");
    }
  }

  function compactTopSearchRefresh() {
    const search = findSearchInput();
    const refresh = findRefreshButton();
    if (!search || !refresh) return;

    if (search.closest(".csvb-search-refresh-inline") || refresh.closest(".csvb-search-refresh-inline")) {
      return;
    }

    const oldSearchParent = search.parentElement;
    const oldRefreshParent = refresh.parentElement;

    const common = findCommonAncestor(search, refresh) || search.parentElement;
    if (!common) return;

    common.classList.add("csvb-session-panel");

    const wrap = document.createElement("div");
    wrap.className = "csvb-search-refresh-inline";

    const anchor = common.contains(search) ? search : common.firstChild;
    common.insertBefore(wrap, anchor);

    wrap.appendChild(search);
    wrap.appendChild(refresh);

    search.setAttribute("title", "Search questionnaires by title, vessel, status, or assignment.");
    refresh.setAttribute("title", "Refresh the questionnaire list.");

    hideIfNowEmpty(oldSearchParent);
    hideIfNowEmpty(oldRefreshParent);
  }

  function inlineTemplateActions() {
    const rows = Array.from(document.querySelectorAll("table tr"));

    rows.forEach((tr) => {
      const buttons = Array.from(tr.querySelectorAll("button, a.btn, a.button")).filter((el) => {
        const t = textOf(el);
        return /Compile \(replace questions\)|Compile|Create Questionnaire for Vessel/i.test(t);
      });

      const compileBtn = buttons.find((el) => /Compile/i.test(textOf(el)));
      const createBtn = buttons.find((el) => /Create Questionnaire for Vessel/i.test(textOf(el)));

      if (!compileBtn || !createBtn) return;

      const td = compileBtn.closest("td");
      if (!td) return;
      if (td.querySelector(":scope > .csvb-template-actions-inline")) return;

      td.classList.add("csvb-template-actions-cell");

      const oldCompileParent = compileBtn.parentElement;
      const oldCreateParent = createBtn.parentElement;

      const wrap = document.createElement("div");
      wrap.className = "csvb-template-actions-inline";

      td.insertBefore(wrap, compileBtn);
      wrap.appendChild(compileBtn);
      wrap.appendChild(createBtn);

      compileBtn.setAttribute("title", "Replace this template's questions with the currently selected question set.");
      createBtn.setAttribute("title", "Create a questionnaire for the selected vessel from this template.");

      hideIfNowEmpty(oldCompileParent);
      hideIfNowEmpty(oldCreateParent);
    });
  }

  function addMinorTooltips() {
    document.querySelectorAll("button, a.btn, a.button").forEach((el) => {
      if (el.getAttribute("title")) return;
      const t = textOf(el);

      if (/Create \+ Open/i.test(t)) {
        el.setAttribute("title", "Create a questionnaire from the selected questions and open it immediately.");
      } else if (/Select All Filtered/i.test(t)) {
        el.setAttribute("title", "Select all currently filtered questions.");
      } else if (/Clear Selected/i.test(t)) {
        el.setAttribute("title", "Clear the current question selection.");
      } else if (/Clear Title/i.test(t)) {
        el.setAttribute("title", "Clear the questionnaire title field.");
      }
    });
  }

  function run() {
    setMarkers();
    compactTopSearchRefresh();
    inlineTemplateActions();
    addMinorTooltips();
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

const cssTag = '<link rel="stylesheet" href="./csvb-company-builder-density-fix.css?v=20260430_1" />';
const jsTag  = '<script src="./csvb-company-builder-density-fix.js?v=20260430_1"></script>';

if (!html.includes("csvb-company-builder-density-fix.css")) {
  html = html.replace("</head>", `  ${cssTag}\n</head>`);
}

if (!html.includes("csvb-company-builder-density-fix.js")) {
  html = html.replace("</body>", `  ${jsTag}\n</body>`);
}

fs.writeFileSync(htmlFile, html, "utf8");

const swFile = "public/service-worker.js";
if (fs.existsSync(swFile)) {
  let sw = fs.readFileSync(swFile, "utf8");
  if (/const CACHE_VERSION = "[^"]+";/.test(sw)) {
    sw = sw.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v39-mc10d4-company-builder-density-fix";'
    );
  }
  fs.writeFileSync(swFile, sw, "utf8");
}

fs.writeFileSync(
  "public/MC10D4_COMPANY_BUILDER_DENSITY_FIX_APPLIED.txt",
  "MC-10D4 applied: compact search/refresh header and inline template actions for q-company.\n",
  "utf8"
);

console.log("DONE: MC-10D4 applied.");
NODE

echo "DONE: MC-10D4 completed."
echo "Now hard refresh q-company.html with Ctrl + Shift + R"
