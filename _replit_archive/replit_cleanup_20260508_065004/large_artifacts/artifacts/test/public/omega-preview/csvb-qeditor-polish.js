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
