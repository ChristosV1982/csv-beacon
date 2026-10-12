// public/csvb-post-inspection-stats-polish.js
// MC-10D5 — Post-Inspection Stats polish
// Visual/helper only.

(() => {
  "use strict";

  const BUILD = "MC10D5-2026-04-30";

  function pageName() {
    return String(window.location.pathname || "").split("/").pop() || "";
  }

  function mark() {
    window.CSVB_POST_INSPECTION_STATS_POLISH_BUILD = BUILD;
    document.documentElement.setAttribute("data-csvb-poststats-polish", BUILD);
    document.documentElement.setAttribute("data-csvb-page", pageName());
  }

  function textOf(el) {
    return String(el?.textContent || "").replace(/\s+/g, " ").trim();
  }

  function addHelperStrip() {
    if (document.getElementById("csvbPostStatsHelper")) return;

    const strip = document.createElement("div");
    strip.id = "csvbPostStatsHelper";
    strip.className = "csvb-poststats-helper";
    strip.innerHTML = `
      <div class="csvb-poststats-helper-title">📈 Post-Inspection Statistics</div>
      <div class="csvb-poststats-helper-note">
        Review observation trends, inspection KPIs, vessel performance and recurring SIRE 2.0 findings. Hover over actions for guidance.
      </div>
    `;

    const topbar = document.querySelector("header,.topbar,.appHeader");
    if (topbar && topbar.parentElement) {
      topbar.insertAdjacentElement("afterend", strip);
      return;
    }

    const host = document.querySelector("main,.wrap,.container,body");
    host.prepend(strip);
  }

  function groupControls() {
    const candidates = Array.from(document.querySelectorAll("section,.panel,.card,.box,div"));

    candidates.forEach((box) => {
      if (box.dataset.csvbPoststatsControls === "1") return;

      const controls = Array.from(box.children).filter((child) => {
        return child.matches?.("input,select,button,a") ||
          child.querySelector?.("input,select,button,a");
      });

      const text = textOf(box);
      const looksLikeControls =
        /filter|date|vessel|chapter|refresh|clear|export|search|company/i.test(text) &&
        controls.length >= 2;

      if (!looksLikeControls) return;

      box.classList.add("csvb-poststats-control-row");
      box.dataset.csvbPoststatsControls = "1";
    });
  }

  function wrapTables() {
    document.querySelectorAll("table").forEach((table) => {
      if (table.closest(".csvb-poststats-table-wrap")) return;

      const wrap = document.createElement("div");
      wrap.className = "csvb-poststats-table-wrap";

      table.parentNode.insertBefore(wrap, table);
      wrap.appendChild(table);
    });
  }

  function addActionGroups() {
    document.querySelectorAll("td, .actions, .buttonRow, .toolbar").forEach((box) => {
      if (box.querySelector(":scope > .csvb-poststats-actions")) return;

      const buttons = Array.from(box.querySelectorAll("button,a.btn,a.btn2,a.button")).filter((b) => {
        return /open|view|export|download|clear|refresh|details|filter/i.test(textOf(b));
      });

      if (buttons.length < 2) return;

      const wrap = document.createElement("div");
      wrap.className = "csvb-poststats-actions";

      box.insertBefore(wrap, buttons[0]);
      buttons.forEach((b) => wrap.appendChild(b));
    });
  }

  function addTooltips() {
    const rules = [
      [/refresh/i, "Reload the latest post-inspection statistics from the database."],
      [/clear/i, "Clear the active filters."],
      [/export/i, "Export the current statistics or table view."],
      [/download/i, "Download the current report or exported file."],
      [/open|view/i, "Open the selected inspection, observation, or detail view."],
      [/filter/i, "Apply the selected filters to the statistics."],
      [/dashboard/i, "Return to the dashboard."],
      [/mode selection/i, "Return to mode selection."],
      [/logout/i, "Sign out of the current session."]
    ];

    document.querySelectorAll("button,a.btn,a.btn2,a.button").forEach((el) => {
      if (el.getAttribute("data-csvb-help")) return;

      const t = textOf(el);
      const rule = rules.find(([rx]) => rx.test(t));

      if (rule) {
        el.setAttribute("data-csvb-help", rule[1]);
        el.setAttribute("title", rule[1]);
      }
    });
  }

  function addSectionIcons() {
    const map = [
      [/kpi|performance/i, "🎯"],
      [/vessel/i, "🚢"],
      [/chapter/i, "📚"],
      [/observation|negative|positive/i, "📝"],
      [/inspector/i, "🧭"],
      [/trend|stat|chart/i, "📈"],
      [/filter/i, "🔎"],
      [/report/i, "📑"]
    ];

    document.querySelectorAll("h1,h2,h3,h4,b,strong").forEach((h) => {
      if (h.dataset.csvbPoststatsIconed === "1") return;

      const t = textOf(h);
      const found = map.find(([rx]) => rx.test(t));
      if (!found) return;

      h.dataset.csvbPoststatsIconed = "1";
      const span = document.createElement("span");
      span.className = "csvb-poststats-icon";
      span.textContent = found[1];

      h.prepend(span);
    });
  }

  function normalizeKpiCards() {
    const likelyCards = Array.from(document.querySelectorAll(".card,.panel,.box,section,div")).filter((el) => {
      const t = textOf(el);
      if (t.length > 80) return false;
      return /total|negative|positive|largely|inspection|observation|vessel|question|kpi/i.test(t) &&
             /\d/.test(t);
    });

    likelyCards.slice(0, 24).forEach((card) => {
      if (card.dataset.csvbPoststatsKpi === "1") return;

      const text = textOf(card);
      if (!text) return;

      card.dataset.csvbPoststatsKpi = "1";
      card.classList.add("csvb-poststats-kpi-card");
    });

    const parentGroups = new Set();

    likelyCards.forEach((card) => {
      if (card.parentElement) parentGroups.add(card.parentElement);
    });

    parentGroups.forEach((parent) => {
      const childKpis = Array.from(parent.children).filter((x) =>
        x.classList?.contains("csvb-poststats-kpi-card")
      );

      if (childKpis.length >= 3) {
        parent.classList.add("csvb-poststats-kpi-grid");
      }
    });
  }

  function polish() {
    mark();
    addHelperStrip();
    groupControls();
    wrapTables();
    addActionGroups();
    addTooltips();
    addSectionIcons();
    normalizeKpiCards();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", polish);
  } else {
    polish();
  }

  setTimeout(polish, 700);
  setTimeout(polish, 1800);
  setTimeout(polish, 3500);
})();
