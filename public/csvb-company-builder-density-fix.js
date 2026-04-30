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
