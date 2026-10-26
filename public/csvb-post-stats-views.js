// Phase 1 presentation shell. Existing source DOM, data and calculations stay intact.
(() => {
  "use strict";
  const views = [
    ["overview", "Overview / Summary", "Review report and observation totals alongside missing PGNOs, unique questions and observation-type counts. Use this summary to orient the selected inspection scope.", "📊"],
    ["visual", "Visual Overview", "Compare Negative, Largely as Expected and Positive observations by category and period. See how each observation type is distributed over time.", "📉"],
    ["comparison", "Independent Comparison Charts", "Build three independent comparisons across years, quarters or months using existing observation metrics. Keep each comparison focused on a different interval or measure.", "⚖️"],
    ["fleet", "Fleet / Vessel Performance", "Review vessel performance, selected-scope averages and observation bars by vessel. Compare counts and averages within the current selection.", "🚢"],
    ["question-chapter", "Question / Chapter Performance", "Find recurring questions, review chapter distribution and follow question or chapter trends. See repeated findings and where they are concentrated.", "🔎"],
    ["cause-category", "Cause / Category Analysis", "Review rankings and trends for designation, SOC, NOC and M-SCAT categories. Use these breakdowns to examine how recorded causes are represented.", "🧩"],
    ["party", "Inspection Party Analysis", "Compare inspecting-company, inspector/auditor and inspector-company counts and averages. Review the available breakdowns together to see how inspection parties are represented.", "🧭"],
    ["trend", "Trend Analysis", "Review monthly observation counts, report counts and averages for the selected year. Compare quieter and busier months across the year.", "📈"],
    ["pgno", "PGNO Analytics", "Review assigned PGNOs, their question associations and trends, alongside missing-PGNO records. Focus follow-up on codes and questions represented in the analytics.", "🏷️"],
    ["mscat", "M-SCAT Analytics", "Explore cause and control-area selections, compare available sources, and review rankings and trends. Examine recorded M-SCAT patterns across the existing breakdowns.", "🧠"],
    ["sector", "Sector Analytics", "Compare Navigation, Cargo and Mooring across available sources, then review trends and recurring questions. Use the sector breakdowns to focus on recurring patterns.", "⚓"]
  ];
  const requested = new URLSearchParams(location.search).get("view");
  const current = views.find(([key]) => key === requested);
  window.CSVB_POST_STATS_VIEW = Object.freeze({ enabled: true, key: current?.[0] || null });
  document.documentElement.dataset.csvbStatsView = current?.[0] || "landing";
  const dynamicIds = [
    "csvbStatsComparePanelV01", "csvbStatsCompositionPanelV01", "csvbStatsChapterSharePanelV01",
    "csvbStatsByVesselObsPanelV01", "csvbStatsTopRecurringBarsPanelV01",
    "csvbStatsByCategoryBarsPanelV01", "csvbStatsByOcimfBarsPanelV01",
    "csvbStatsByInspectorBarsPanelV01", "csvbStatsByInspectorCompanyBarsPanelV01",
    "csvbStatsTopSocBarsPanelV01", "csvbStatsTopNocBarsPanelV01", "csvbStatsPgnoBarsPanelV01",
    "csvbQcpPanelV01", "csvbCauseCatPanelV01", "csvbSectorAnalyticsPanelV01"
  ];

  function start() {
    const wrap = document.querySelector(".wrap");
    if (!wrap) return;
    const filters = document.getElementById("statsMode")?.closest(".panel");
    const summary = document.getElementById("sumReports")?.closest(".statGrid");
    const sources = [...wrap.children].filter(node => !node.classList.contains("topbar"));
    sources.forEach(node => node.setAttribute("data-csvb-stats-source", ""));
    document.getElementById("mscatAnalyticsPanel")?.setAttribute("data-csvb-stats-source", "");
    document.getElementById("measurementSectionsCard")?.setAttribute("data-csvb-stats-source", "");

    const landing = document.createElement("section");
    landing.id = "csvbAnalyticsLanding";
    const heading = document.createElement("h1");
    heading.textContent = "Post-Inspection Analytics";
    landing.appendChild(heading);
    const grid = document.createElement("div");
    grid.className = "csvb-analytics-grid";
    views.forEach(([key, title, description, icon]) => {
      const card = document.createElement("article");
      card.className = "csvb-analytics-card";
      const heading = document.createElement("div");
      heading.className = "csvb-analytics-card-heading";
      const iconContainer = document.createElement("span");
      iconContainer.className = "csvb-analytics-card-icon";
      iconContainer.setAttribute("aria-hidden", "true");
      iconContainer.textContent = icon;
      const name = document.createElement("h2");
      name.textContent = title;
      heading.append(iconContainer, name);
      const text = document.createElement("p");
      text.textContent = description;
      const link = document.createElement("a");
      link.className = "csvb-analytics-open";
      link.href = `./post_inspection_stats.html?view=${key}`;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Open";
      link.setAttribute("aria-label", `Open ${title} in a new tab`);
      card.append(heading, text, link);
      grid.appendChild(card);
    });
    landing.appendChild(grid);
    wrap.appendChild(landing);
    document.documentElement.setAttribute("data-csvb-stats-mounted", "");
    if (!current) {
      const hideDynamicSources = () => dynamicIds.forEach(id => {
        const node = document.getElementById(id);
        if (node && !node.hasAttribute("data-csvb-stats-source")) node.setAttribute("data-csvb-stats-source", "");
      });
      new MutationObserver(hideDynamicSources).observe(document.body, { childList: true, subtree: true });
      hideDynamicSources();
      return;
    }
    landing.hidden = true;
    const headingBar = document.createElement("div");
    headingBar.id = "csvbAnalyticsViewHeading";
    const title = document.createElement("h1");
    title.textContent = current[1];
    const back = document.createElement("a");
    back.id = "csvbBackToAnalytics";
    back.className = "btn btn-outline";
    back.href = "./post_inspection_stats.html";
    back.textContent = "Back to Analytics";
    headingBar.append(title, back);
    wrap.appendChild(headingBar);
    const host = document.createElement("div");
    host.id = "csvbAnalyticsViewContent";
    wrap.appendChild(filters);
    filters?.removeAttribute("data-csvb-stats-source");
    wrap.appendChild(host);
    if (summary && current[0] !== "overview") summary.setAttribute("data-csvb-stats-source", "");
    // Keep all original controls and their IDs/listeners; only hide irrelevant presentation.
    ["recurringMinCount", "recYearDrop", "recMonthDrop", "trendYearFilter"].forEach(id => {
      const node = document.getElementById(id);
      const field = node?.closest(".field-small, .filterDrop");
      const relevant = id === "trendYearFilter" ? current[0] === "trend" : current[0] === "question-chapter";
      if (field && !relevant) field.setAttribute("data-csvb-stats-source", "");
    });
    const panelFor = id => document.getElementById(id)?.closest(".panel");
    function selectedNodes() {
      const byId = id => document.getElementById(id);
      switch (current[0]) {
        case "overview": return [panelFor("byTypeTbody")];
        case "visual": return ["chartNegCategory", "chartLargelyCategory", "chartPositiveMonthly"].map(panelFor);
        case "comparison": return [byId("csvbStatsComparePanelV01")];
        case "fleet": return [panelFor("byVesselTbody"), panelFor("avgFleetTbody"), byId("csvbStatsByVesselObsPanelV01")];
        case "question-chapter": return [byId("csvbQcpPanelV01")];
        case "cause-category": return [byId("csvbCauseCatPanelV01")];
        case "party": return ["byOcimfTbody", "byInspectorTbody", "byInspectorCompanyTbody"].map(panelFor).concat(
          ["csvbStatsByOcimfBarsPanelV01", "csvbStatsByInspectorBarsPanelV01", "csvbStatsByInspectorCompanyBarsPanelV01"].map(byId));
        case "trend": return [panelFor("monthlyTbody")];
        case "pgno": return [panelFor("pgnoTableTbody")];
        case "mscat": return [byId("mscatAnalyticsPanel")];
        case "sector": return [byId("csvbSectorAnalyticsPanelV01")];
        default: return [];
      }
    }
    function reconcile() {
      const selected = selectedNodes().filter(Boolean);
      dynamicIds.forEach(id => {
        const node = document.getElementById(id);
        if (node && !selected.includes(node) && !node.hasAttribute("data-csvb-stats-source")) {
          node.setAttribute("data-csvb-stats-source", "");
        }
      });
      selected.forEach(node => {
        node.removeAttribute("data-csvb-stats-source");
        if (node.parentElement !== host) {
          host.appendChild(node);
        }
        // A helper may mount its collapsible body after the source panel is selected.
        // Open it once, then leave the original toggle's state under user control.
        node.querySelectorAll("#csvbQcpBody, #csvbCauseCatBody, #csvbSectorBody, #csvbSectorCollapseBody, #csvbMscatCollapseBody").forEach(body => {
          if (body.dataset.csvbDedicatedInitialized) return;
          body.dataset.csvbDedicatedInitialized = "1";
          body.hidden = false;
          node.querySelectorAll("#csvbQcpIcon, #csvbCauseCatIcon, #csvbMscatCollapseIcon, #csvbSectorCollapseIcon").forEach(icon => {
            icon.textContent = "−";
          });
        });
      });
    }
    // Observe only structure, never data requests or attribute mutations. No periodic repair loop.
    let scheduled = false;
    const schedule = () => {
      if (scheduled) return;
      scheduled = true;
      setTimeout(() => { scheduled = false; reconcile(); }, 30);
    };
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
    window.addEventListener("csvb:post-stats-snapshot", schedule);
    reconcile();
  }
  document.addEventListener("DOMContentLoaded", start, { once: true });
})();
