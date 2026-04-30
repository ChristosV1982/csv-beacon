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
