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
