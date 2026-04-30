// MC-10D5R
// Post-Inspection Stats targeted repair:
// - close vessel dropdown on load/outside click
// - normalize PGNO analytics into vertical stacked rows
// Visual/helper only.

(() => {
  "use strict";

  const BUILD = "MC10D5R-2026-04-30";

  function pageName() {
    return String(window.location.pathname || "").split("/").pop() || "";
  }

  function mark() {
    window.CSVB_POST_STATS_REPAIR_BUILD = BUILD;
    document.documentElement.setAttribute("data-csvb-page", pageName());
    document.documentElement.setAttribute("data-csvb-poststats-repair", BUILD);
  }

  function textOf(el) {
    return String(el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function looksLikeVesselDropdownPanel(el) {
    if (!el || el === document.body || el === document.documentElement) return false;

    const text = textOf(el);
    if (!text) return false;

    const hasChecks = el.querySelectorAll('input[type="checkbox"]').length >= 2;
    const hasVesselNames = /GOOD SHIP|OLYMPIC|VESSEL|SHIP/i.test(text);
    const hasAllNone = /All|None/i.test(text);

    return hasChecks && hasVesselNames && hasAllNone;
  }

  function findVesselDropdownPanels() {
    return Array.from(document.querySelectorAll("div, section, ul, form")).filter(looksLikeVesselDropdownPanel);
  }

  function closeDropdownPanel(panel) {
    if (!panel) return;
    panel.setAttribute("data-csvb-dropdown-forced-hidden", "1");
    panel.classList.add("csvb-force-hidden");
  }

  function openDropdownPanel(panel) {
    if (!panel) return;
    panel.removeAttribute("data-csvb-dropdown-forced-hidden");
    panel.classList.remove("csvb-force-hidden");
    panel.classList.add("csvb-filter-dropdown-panel");
  }

  function closeAllVesselDropdowns() {
    findVesselDropdownPanels().forEach(closeDropdownPanel);
  }

  function wireVesselDropdowns() {
    const panels = findVesselDropdownPanels();

    panels.forEach((panel) => {
      panel.classList.add("csvb-filter-dropdown-panel");
      closeDropdownPanel(panel);
    });

    const possibleButtons = Array.from(document.querySelectorAll("button, .btn, .filter, .filterBtn, select, div, span")).filter((el) => {
      const t = textOf(el);
      return /Vessels?:\s*all|Vessel\(s\)|Vessels/i.test(t) && !looksLikeVesselDropdownPanel(el);
    });

    possibleButtons.forEach((btn) => {
      if (btn.dataset.csvbVesselDropBound === "1") return;
      btn.dataset.csvbVesselDropBound = "1";

      btn.addEventListener("click", (ev) => {
        const freshPanels = findVesselDropdownPanels();

        if (!freshPanels.length) return;

        const anyVisible = freshPanels.some((p) => {
          const cs = window.getComputedStyle(p);
          return cs.display !== "none" && !p.classList.contains("csvb-force-hidden");
        });

        freshPanels.forEach((p) => {
          if (anyVisible) closeDropdownPanel(p);
          else openDropdownPanel(p);
        });

        ev.stopPropagation();
      });
    });

    document.addEventListener("click", (ev) => {
      const target = ev.target;

      if (target.closest?.(".csvb-filter-dropdown-panel")) return;

      const isVesselButton = Array.from(possibleButtons).some((b) => b.contains(target));
      if (isVesselButton) return;

      closeAllVesselDropdowns();
    });

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") closeAllVesselDropdowns();
    });
  }

  function likelyPgnoSection(el) {
    const t = textOf(el);
    return /PGNO Analytics|Top PGNO|PGNO by Question|Missing PGNO Trend/i.test(t);
  }

  function normalizePgnoRowsInBox(box) {
    if (!box || box.dataset.csvbPgnoBoxDone === "1") return;

    const buttons = Array.from(box.querySelectorAll("button, a")).filter((x) => /^View$/i.test(textOf(x)));
    if (!buttons.length) return;

    box.dataset.csvbPgnoBoxDone = "1";
    box.classList.add("csvb-pgno-box-vertical");

    buttons.forEach((btn) => {
      if (btn.closest(".csvb-pgno-row")) return;

      const parent = btn.parentElement;
      if (!parent) return;

      const row = document.createElement("div");
      row.className = "csvb-pgno-row";
      row.setAttribute("data-csvb-pgno-normalized", "1");

      const rawText = textOf(parent);
      const noButtonText = rawText.replace(/\bView\b/g, "").trim();

      let titleText = noButtonText;
      let metricsText = "";

      const match = noButtonText.match(/^(.*?)(\d+\s*\/\s*\d+\s*\/\s*[\d.]+)\s*$/);
      if (match) {
        titleText = match[1].trim();
        metricsText = match[2].trim();
      }

      const title = document.createElement("div");
      title.className = "csvb-pgno-row-title";
      title.textContent = titleText || noButtonText;

      const metrics = document.createElement("div");
      metrics.className = "csvb-pgno-row-metrics";
      metrics.textContent = metricsText;

      const actions = document.createElement("div");
      actions.className = "csvb-pgno-row-actions";

      parent.insertBefore(row, parent.firstChild);
      row.appendChild(title);
      row.appendChild(metrics);
      row.appendChild(actions);
      actions.appendChild(btn);

      btn.setAttribute("data-csvb-help", "Open the detailed records behind this PGNO statistic.");
      btn.setAttribute("title", "Open the detailed records behind this PGNO statistic.");
    });

    Array.from(box.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "|") {
        const sep = document.createElement("span");
        sep.className = "csvb-pgno-separator";
        node.replaceWith(sep);
      }
    });
  }

  function normalizePgnoAnalytics() {
    const sections = Array.from(document.querySelectorAll("section, .panel, .card, .box, div")).filter(likelyPgnoSection);

    sections.forEach((section) => {
      section.classList.add("csvb-pgno-vertical-list");

      const boxes = Array.from(section.querySelectorAll(".card, .box, .panel, div")).filter((box) => {
        const t = textOf(box);
        return /PGNO|Obs\s*\/\s*Insp|Avg|View/i.test(t) && box.querySelector("button, a");
      });

      if (boxes.length) {
        boxes.forEach(normalizePgnoRowsInBox);
      } else {
        normalizePgnoRowsInBox(section);
      }
    });
  }

  function repair() {
    mark();
    wireVesselDropdowns();
    normalizePgnoAnalytics();
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
