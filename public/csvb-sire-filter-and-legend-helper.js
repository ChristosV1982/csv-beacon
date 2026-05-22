// public/csvb-sire-filter-and-legend-helper.js
// C.S.V. BEACON — SIRE Viewer/Editor filter helper + question colour legend
// Frontend-only. No data writes. No filter logic changes.

(() => {
  "use strict";

  const BUILD = "SIRE-FILTER-LEGEND-HELPER-20260520_1";
  window.CSVB_SIRE_FILTER_LEGEND_HELPER_BUILD = BUILD;

  const FILTER_NOTES = {
    facet_status: "Filter the question list by database status. Empty selection = all statuses.",
    facet_source: "Filter the question list by source type. Empty selection = all sources.",
    facet_version: "Filter the question list by library/version tag. Empty selection = all versions.",
    facet_questionType: "Filter the question list by SIRE question type. Empty selection = all question types.",
    facet_vesselType: "Filter the question list by vessel applicability. Empty selection = all vessel types.",
    facet_responseType: "Filter the question list by response category. Empty selection = all response types.",
    facet_companyRank: "Filter the question list by company rank allocation. Empty selection = all ranks.",
    facet_chapter: "Filter the question list by SIRE 2.0 chapter. Empty selection = all chapters."
  };

  function $(id) {
    return document.getElementById(id);
  }

  function injectStyles() {
    if ($("csvbSireFilterLegendHelperStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSireFilterLegendHelperStyles";
    style.textContent = `
      .csvb-sire-filter-note {
        margin: 0 0 6px;
        padding: 4px 6px;
        border-radius: 7px;
        background: #fff36a;
        color: #10233f;
        font-size: 11.5px;
        font-weight: 700;
        line-height: 1.25;
      }

      .csvb-sire-question-colour-legend {
        display: flex;
        align-items: center;
        flex-wrap: wrap;
        gap: 5px 8px;
        margin: 8px 0 6px;
        padding: 7px 8px;
        border: 1px solid #d6e4f5;
        border-radius: 10px;
        background: #f8fbff;
        color: #17324d;
        font-size: 11px;
        font-weight: 800;
        line-height: 1.2;
      }

      .csvb-sire-question-colour-legend-title {
        color: #5e6f86;
        font-weight: 900;
        margin-right: 2px;
      }

      .csvb-sire-legend-item {
        display: inline-flex;
        align-items: center;
        gap: 4px;
        white-space: nowrap;
      }

      .csvb-sire-legend-swatch {
        display: inline-block;
        width: 13px;
        height: 13px;
        border-radius: 4px;
        border: 1px solid rgba(3,27,63,.18);
        flex: 0 0 auto;
      }

      .csvb-sire-legend-core { background: #eaf7ea; }
      .csvb-sire-legend-rot1 { background: #fdecec; }
      .csvb-sire-legend-rot2 { background: #fff2e0; }
    `;

    document.head.appendChild(style);
  }

  function addFilterNotes() {
    Object.entries(FILTER_NOTES).forEach(([facetId, note]) => {
      const facet = $(facetId);
      if (!facet) return;

      const body = facet.querySelector(".facetBody");
      if (!body) return;

      if (body.querySelector(".csvb-sire-filter-note")) return;

      const div = document.createElement("div");
      div.className = "csvb-sire-filter-note";
      div.textContent = note;

      body.insertBefore(div, body.firstChild);
    });
  }

  function closeFacetsExcept(active) {
    document.querySelectorAll("details.facet[open]").forEach((facet) => {
      if (facet !== active) facet.removeAttribute("open");
    });
  }

  function wireFacetClosing() {
    if (document.body.dataset.csvbSireFacetClosingWired === "1") return;
    document.body.dataset.csvbSireFacetClosingWired = "1";

    document.addEventListener("click", (event) => {
      const target = event.target;
      if (!target) return;

      const clickedFacet = target.closest?.("details.facet");
      const clickedPublicationFilter = target.closest?.("#csvbSirePublicationSecondaryFilterShell");

      if (clickedFacet) {
        setTimeout(() => {
          if (clickedFacet.hasAttribute("open")) closeFacetsExcept(clickedFacet);
        }, 0);
        return;
      }

      if (clickedPublicationFilter) {
        closeFacetsExcept(null);
        return;
      }

      closeFacetsExcept(null);
    }, true);

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeFacetsExcept(null);
    });
  }

  function addColourLegend() {
    if ($("csvbSireQuestionColourLegend")) return;

    const sidebarCard = document.querySelector(".sidebar .card");
    if (!sidebarCard) return;

    const hr = sidebarCard.querySelector(".hr");
    const legend = document.createElement("div");
    legend.id = "csvbSireQuestionColourLegend";
    legend.className = "csvb-sire-question-colour-legend";
    legend.innerHTML = `
      <span class="csvb-sire-question-colour-legend-title">Colour key:</span>
      <span class="csvb-sire-legend-item"><span class="csvb-sire-legend-swatch csvb-sire-legend-core"></span>Core</span>
      <span class="csvb-sire-legend-item"><span class="csvb-sire-legend-swatch csvb-sire-legend-rot1"></span>Rot. 1</span>
      <span class="csvb-sire-legend-item"><span class="csvb-sire-legend-swatch csvb-sire-legend-rot2"></span>Rot. 2</span>
    `;

    if (hr) hr.insertAdjacentElement("beforebegin", legend);
    else sidebarCard.appendChild(legend);
  }

  function apply() {
    injectStyles();
    addFilterNotes();
    wireFacetClosing();
    addColourLegend();
  }

  function boot() {
    apply();
    setTimeout(apply, 500);
    setTimeout(apply, 1500);
    setTimeout(apply, 3000);

    window.CSVB_SIRE_FILTER_LEGEND_HELPER = {
      build: BUILD,
      apply,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 250));
  } else {
    setTimeout(boot, 250);
  }
})();
