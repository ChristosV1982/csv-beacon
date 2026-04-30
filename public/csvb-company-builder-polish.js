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
