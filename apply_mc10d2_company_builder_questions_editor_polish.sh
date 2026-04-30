#!/usr/bin/env bash
set -e

if [ ! -d "public" ]; then
  echo "ERROR: public folder not found. Run this from the Replit project root."
  exit 1
fi

mkdir -p backup_before_mc10d2_company_qeditor_polish

for f in \
  public/q-company.html \
  public/q-questions-editor.html \
  public/csvb-company-builder-polish.css \
  public/csvb-company-builder-polish.js \
  public/csvb-qeditor-polish.css \
  public/csvb-qeditor-polish.js \
  public/service-worker.js
do
  if [ -f "$f" ]; then
    cp "$f" backup_before_mc10d2_company_qeditor_polish/$(basename "$f")
  fi
done

cat > public/csvb-company-builder-polish.css <<'CSS'
/* C.S.V. BEACON — MC-10D2 Company Builder Polish */

html[data-csvb-page="q-company.html"] .csvb-company-builder-helper{
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

html[data-csvb-page="q-company.html"] .csvb-company-builder-title{
  color:#062A5E;
  font-weight:700;
  display:flex;
  align-items:center;
  gap:7px;
}

html[data-csvb-page="q-company.html"] .csvb-company-builder-note{
  color:#5E6F86;
  font-size:.9rem;
}

html[data-csvb-page="q-company.html"] .csvb-builder-steps{
  display:grid;
  grid-template-columns:repeat(4, minmax(130px, 1fr));
  gap:8px;
  margin:8px 0 10px;
}

@media(max-width:1000px){
  html[data-csvb-page="q-company.html"] .csvb-builder-steps{
    grid-template-columns:repeat(2, minmax(130px, 1fr));
  }
}

html[data-csvb-page="q-company.html"] .csvb-builder-step{
  background:#F7FAFE;
  border:1px solid #D6E4F5;
  border-radius:10px;
  padding:8px 9px;
  color:#163457;
  font-size:.88rem;
  line-height:1.25;
}

html[data-csvb-page="q-company.html"] .csvb-builder-step b{
  color:#062A5E;
  font-weight:700;
}

html[data-csvb-page="q-company.html"] .csvb-builder-step-icon{
  display:inline-flex;
  width:22px;
  height:22px;
  align-items:center;
  justify-content:center;
  border-radius:8px;
  margin-right:5px;
  background:#E9F7FB;
  border:1px solid #AEE3F1;
}

html[data-csvb-page="q-company.html"] .csvb-builder-section-badge{
  display:inline-flex;
  align-items:center;
  gap:6px;
  color:#062A5E;
  font-weight:700;
}

html[data-csvb-page="q-company.html"] .csvb-builder-section-badge span{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:24px;
  height:24px;
  border-radius:8px;
  background:#E9F7FB;
  border:1px solid #AEE3F1;
}

html[data-csvb-page="q-company.html"] .csvb-effective-library-note{
  margin:6px 0;
  padding:8px 10px;
  border-radius:10px;
  border:1px solid #B8E7C8;
  background:#EAF9EF;
  color:#087334;
  font-weight:500;
}

html[data-csvb-page="q-company.html"] table{
  font-size:.9rem !important;
}

html[data-csvb-page="q-company.html"] .csvb-compact-actions{
  display:flex;
  gap:6px;
  align-items:center;
  flex-wrap:wrap;
}
CSS

cat > public/csvb-company-builder-polish.js <<'JS'
// C.S.V. BEACON — MC-10D2 Company Builder Polish
// Visual/helper-only.

(() => {
  "use strict";

  const BUILD = "MC10D2-COMPANY-BUILDER-2026-04-30";
  window.CSVB_COMPANY_BUILDER_POLISH_BUILD = BUILD;

  function addHelper(){
    if (document.getElementById("csvbCompanyBuilderHelper")) return;

    const strip = document.createElement("div");
    strip.id = "csvbCompanyBuilderHelper";
    strip.className = "csvb-company-builder-helper";

    strip.innerHTML = `
      <div class="csvb-company-builder-title">🏢 Company Builder</div>
      <div class="csvb-company-builder-note">
        Create questionnaires from the selected vessel’s assigned/effective question library.
      </div>
    `;

    const topbar = document.querySelector("header,.topbar,.appHeader");
    if (topbar && topbar.parentElement) {
      topbar.insertAdjacentElement("afterend", strip);
      return;
    }

    const host = document.querySelector(".wrap,main,body");
    host.prepend(strip);
  }

  function addSteps(){
    if (document.getElementById("csvbBuilderSteps")) return;

    const panel =
      Array.from(document.querySelectorAll("section,.panel,div"))
        .find((x) => /Create Questionnaire/i.test(x.textContent || "")) ||
      document.querySelector(".wrap,main");

    if (!panel) return;

    const steps = document.createElement("div");
    steps.id = "csvbBuilderSteps";
    steps.className = "csvb-builder-steps";

    steps.innerHTML = `
      <div class="csvb-builder-step"><span class="csvb-builder-step-icon">🚢</span><b>1. Select vessel</b><br>Loads that vessel’s assigned/effective question library.</div>
      <div class="csvb-builder-step"><span class="csvb-builder-step-icon">🔎</span><b>2. Filter questions</b><br>Use filters/search to narrow the active library.</div>
      <div class="csvb-builder-step"><span class="csvb-builder-step-icon">✅</span><b>3. Select questions</b><br>Select all filtered or clear and choose again.</div>
      <div class="csvb-builder-step"><span class="csvb-builder-step-icon">📝</span><b>4. Create</b><br>Create a questionnaire with frozen snapshots.</div>
    `;

    const heading =
      Array.from(panel.querySelectorAll("h1,h2,h3,b"))
        .find((x) => /Create Questionnaire/i.test(x.textContent || ""));

    if (heading) {
      heading.insertAdjacentElement("afterend", steps);
    } else {
      panel.prepend(steps);
    }
  }

  function polishHeadings(){
    const map = [
      [/Create Questionnaire/i, "📝"],
      [/Compile Questionnaire/i, "✅"],
      [/Standard Questionnaires|Templates/i, "📋"],
      [/Templates/i, "🗂️"],
      [/Supabase connection/i, "🔌"]
    ];

    document.querySelectorAll("h1,h2,h3,b,strong").forEach((h) => {
      if (h.dataset.csvbBuilderBadge === "1") return;

      const text = String(h.textContent || "");
      for (const [rx, icon] of map) {
        if (!rx.test(text)) continue;

        h.dataset.csvbBuilderBadge = "1";
        h.innerHTML = `<span class="csvb-builder-section-badge"><span>${icon}</span>${h.innerHTML}</span>`;
        break;
      }
    });
  }

  function addSpecificHelp(){
    const rules = [
      [/Select All Filtered/i, "Select every question currently matching the active filters."],
      [/Clear Selected/i, "Remove the current question selection without changing filters."],
      [/Create \+ Open/i, "Create the questionnaire and immediately open it for answering."],
      [/Create Template/i, "Create a reusable template record. Compile questions into it afterward."],
      [/Compile/i, "Replace this template’s question list with the current selected questions."],
      [/Create Q/i, "Create a questionnaire from this template using the selected vessel’s effective library."],
      [/Refresh/i, "Reload vessels, questionnaires, templates, and effective library data."],
      [/Clear Title/i, "Clear the questionnaire title field."],
      [/Clear/i, "Clear this form field or selection."]
    ];

    document.querySelectorAll("button,a.btn,a.btn2").forEach((btn) => {
      const text = String(btn.textContent || "").trim();
      for (const [rx, help] of rules) {
        if (rx.test(text)) {
          btn.setAttribute("data-csvb-help", help);
          break;
        }
      }
    });

    const vessel = document.getElementById("vesselSelect");
    if (vessel) {
      vessel.setAttribute("data-csvb-help", "Changing vessel reloads the assigned/effective question library for that vessel’s company.");
    }

    const title = document.getElementById("titleInput");
    if (title) {
      title.setAttribute("data-csvb-help", "This title will be used as the questionnaire name.");
    }

    const search = document.getElementById("fltSearch");
    if (search) {
      search.setAttribute("data-csvb-help", "Search within the active effective question library.");
    }
  }

  function addEffectiveLibraryNote(){
    if (document.getElementById("csvbEffectiveLibraryNote")) return;

    const line = document.getElementById("libraryLockLine");
    if (!line) return;

    const note = document.createElement("div");
    note.id = "csvbEffectiveLibraryNote";
    note.className = "csvb-effective-library-note";
    note.textContent = "The question list is controlled by company assignments and uses effective company-specific snapshots.";

    line.insertAdjacentElement("afterend", note);
  }

  function polish(){
    addHelper();
    addSteps();
    polishHeadings();
    addSpecificHelp();
    addEffectiveLibraryNote();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", polish);
  } else {
    polish();
  }

  setTimeout(polish, 800);
  setTimeout(polish, 1800);
})();
JS

cat > public/csvb-qeditor-polish.css <<'CSS'
/* C.S.V. BEACON — MC-10D2 Questions Editor Polish */

html[data-csvb-page="q-questions-editor.html"] .csvb-qeditor-helper{
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

html[data-csvb-page="q-questions-editor.html"] .csvb-qeditor-helper-title{
  color:#062A5E;
  font-weight:700;
  display:flex;
  align-items:center;
  gap:7px;
}

html[data-csvb-page="q-questions-editor.html"] .csvb-qeditor-helper-note{
  color:#5E6F86;
  font-size:.9rem;
}

html[data-csvb-page="q-questions-editor.html"] .csvb-qeditor-workflow{
  width:100%;
  max-width:100%;
  margin:6px auto 8px;
  display:grid;
  grid-template-columns:repeat(3, minmax(180px, 1fr));
  gap:8px;
}

@media(max-width:1000px){
  html[data-csvb-page="q-questions-editor.html"] .csvb-qeditor-workflow{
    grid-template-columns:1fr;
  }
}

html[data-csvb-page="q-questions-editor.html"] .csvb-qeditor-workflow-item{
  border:1px solid #D6E4F5;
  border-radius:10px;
  background:#F7FAFE;
  color:#163457;
  padding:8px 9px;
  font-size:.88rem;
  line-height:1.25;
}

html[data-csvb-page="q-questions-editor.html"] .csvb-qeditor-workflow-item b{
  color:#062A5E;
  font-weight:700;
}

html[data-csvb-page="q-questions-editor.html"] .csvb-qeditor-badge{
  display:inline-flex;
  align-items:center;
  justify-content:center;
  width:24px;
  height:24px;
  border-radius:8px;
  background:#E9F7FB;
  border:1px solid #AEE3F1;
  color:#062A5E;
  margin-right:5px;
}

html[data-csvb-page="q-questions-editor.html"] .csvb-qeditor-separation-note{
  margin:6px 0 8px;
  padding:8px 10px;
  border-radius:10px;
  border:1px solid #F6D58F;
  background:#FFF6E0;
  color:#8A5A00;
  font-size:.9rem;
  font-weight:500;
}

html[data-csvb-page="q-questions-editor.html"] .csvb-override-launcher-wrap{
  justify-content:center !important;
  margin-top:6px !important;
  margin-bottom:6px !important;
}

html[data-csvb-page="q-questions-editor.html"] table{
  font-size:.9rem !important;
}
CSS

cat > public/csvb-qeditor-polish.js <<'JS'
// C.S.V. BEACON — MC-10D2 Questions Editor Polish
// Visual/helper-only.

(() => {
  "use strict";

  const BUILD = "MC10D2-QEDITOR-2026-04-30";
  window.CSVB_QEDITOR_POLISH_BUILD = BUILD;

  function addHelper(){
    if (document.getElementById("csvbQEditorHelper")) return;

    const strip = document.createElement("div");
    strip.id = "csvbQEditorHelper";
    strip.className = "csvb-qeditor-helper";

    strip.innerHTML = `
      <div class="csvb-qeditor-helper-title">✏️ Questions Editor</div>
      <div class="csvb-qeditor-helper-note">
        Master questions, company custom questions, PGNOs, and expected evidence are managed here. Company overrides are handled separately.
      </div>
    `;

    const topbar = document.querySelector("header,.topbar,.appHeader");
    if (topbar && topbar.parentElement) {
      topbar.insertAdjacentElement("afterend", strip);
      return;
    }

    const host = document.querySelector(".wrap,main,body");
    host.prepend(strip);
  }

  function addWorkflow(){
    if (document.getElementById("csvbQEditorWorkflow")) return;

    const helper = document.getElementById("csvbQEditorHelper");
    const flow = document.createElement("div");
    flow.id = "csvbQEditorWorkflow";
    flow.className = "csvb-qeditor-workflow";

    flow.innerHTML = `
      <div class="csvb-qeditor-workflow-item"><span class="csvb-qeditor-badge">📚</span><b>Master Library</b><br>SIRE/platform records remain controlled by platform administrators.</div>
      <div class="csvb-qeditor-workflow-item"><span class="csvb-qeditor-badge">🏢</span><b>Company Custom</b><br>Company-owned questions can be managed without altering the platform library.</div>
      <div class="csvb-qeditor-workflow-item"><span class="csvb-qeditor-badge">✏️</span><b>Overrides</b><br>Company changes to platform questions are drafted in Company Question Overrides.</div>
    `;

    if (helper) {
      helper.insertAdjacentElement("afterend", flow);
    } else {
      const host = document.querySelector(".wrap,main,body");
      host.prepend(flow);
    }
  }

  function addSeparationNote(){
    if (document.getElementById("csvbQEditorSeparationNote")) return;

    const launcher = document.getElementById("csvbQuestionOverridesLauncherWrap");
    const note = document.createElement("div");
    note.id = "csvbQEditorSeparationNote";
    note.className = "csvb-qeditor-separation-note";
    note.textContent = "Rule: do not edit SIRE/platform master question text for company-specific changes. Use Company Question Overrides instead.";

    if (launcher) {
      launcher.insertAdjacentElement("afterend", note);
      return;
    }

    const helper = document.getElementById("csvbQEditorWorkflow") || document.getElementById("csvbQEditorHelper");
    if (helper) helper.insertAdjacentElement("afterend", note);
  }

  function addHelp(){
    const rules = [
      [/Reload/i, "Reload the question list from the database."],
      [/\+ New Question/i, "Create a new company custom question. Official SIRE questions should remain controlled by platform administrators."],
      [/Edit/i, "Enter edit mode for this question if your role and company permissions allow it."],
      [/View/i, "Return to read-only viewing mode."],
      [/Save/i, "Save changes to this question or company custom record."],
      [/Reset/i, "Discard unsaved edits and restore the current stored values."],
      [/Deactivate/i, "Set this question inactive without deleting its history."],
      [/Delete/i, "Permanently delete this question and child rows. Use only when certain."],
      [/Company Question Overrides/i, "Open the company override workflow. Use this for company-specific changes to platform questions."]
    ];

    document.querySelectorAll("button,a.btn,a.btn2").forEach((el) => {
      const text = String(el.textContent || "").trim();
      for (const [rx, help] of rules) {
        if (rx.test(text)) {
          el.setAttribute("data-csvb-help", help);
          break;
        }
      }
    });

    const search = document.querySelector('input[placeholder*="Search"], #searchInput, #qSearch');
    if (search) {
      search.setAttribute("data-csvb-help", "Search by question number, short text, or question wording.");
    }
  }

  function polish(){
    addHelper();
    addWorkflow();
    addSeparationNote();
    addHelp();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", polish);
  } else {
    polish();
  }

  setTimeout(polish, 800);
  setTimeout(polish, 1800);
})();
JS

node <<'NODE'
const fs = require("fs");

function inject(file, css, js){
  if (!fs.existsSync(file)) return;

  let html = fs.readFileSync(file, "utf8");

  if (!html.includes(css)) {
    const tag = `<link rel="stylesheet" href="./${css}?v=20260430_1" />`;
    html = html.includes("</head>")
      ? html.replace("</head>", `  ${tag}\n</head>`)
      : tag + "\n" + html;
  }

  if (!html.includes(js)) {
    const tag = `<script src="./${js}?v=20260430_1"></script>`;
    html = html.includes("</body>")
      ? html.replace("</body>", `  ${tag}\n</body>`)
      : html + "\n" + tag + "\n";
  }

  fs.writeFileSync(file, html, "utf8");
}

inject("public/q-company.html", "csvb-company-builder-polish.css", "csvb-company-builder-polish.js");
inject("public/q-questions-editor.html", "csvb-qeditor-polish.css", "csvb-qeditor-polish.js");

const sw = "public/service-worker.js";

if (fs.existsSync(sw)) {
  let s = fs.readFileSync(sw, "utf8");

  if (/const CACHE_VERSION = "[^"]+";/.test(s)) {
    s = s.replace(
      /const CACHE_VERSION = "[^"]+";/,
      'const CACHE_VERSION = "v36-mc10d2-company-qeditor-polish";'
    );
  }

  fs.writeFileSync(sw, s, "utf8");
}

fs.writeFileSync(
  "public/MC10D2_COMPANY_QEDITOR_POLISH_APPLIED.txt",
  "MC-10D2 applied: Company Builder and Questions Editor module-specific polish, icons, workflow hints, and contextual help.\\n",
  "utf8"
);

console.log("DONE: MC-10D2 Company Builder + Questions Editor polish applied.");
NODE

echo "DONE: MC-10D2 completed."
echo "Next: hard refresh q-company.html and q-questions-editor.html with Ctrl + Shift + R."
