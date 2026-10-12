// C.S.V. BEACON - Post-Inspection Stats Density and Readability v01
// Display-only helper. Reduces empty buffer space in visual controls and makes legend wording wrap/read fully.
// No stored data, calculations, filters, drilldowns, exports, auth, Supabase, device or offline logic is changed.
(() => {
  "use strict";

  const BUILD = "POST-INSPECTION-STATS-DENSITY-READABLE-V01-20260601";
  window.CSVB_POST_STATS_DENSITY_READABLE_BUILD = BUILD;

  function injectStyle() {
    if (document.getElementById("csvbStatsDensityReadableV01Style")) return;
    const style = document.createElement("style");
    style.id = "csvbStatsDensityReadableV01Style";
    style.textContent = `
      /* Reduce excess vertical buffer in filter/cards/checkbox boxes */
      .statGrid{gap:10px!important;margin-top:10px!important;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))!important;}
      .stat{min-height:88px!important;padding:14px 16px!important;}
      .panel{margin:8px 0!important;padding:8px!important;}
      .card{padding:10px!important;}
      .chartGrid{gap:10px!important;margin-top:8px!important;}
      .chartBox{padding:8px!important;min-height:0!important;}
      .csvb-stats-compare-v03,.csvb-composition-v02,#csvbStatsChapterSharePanelV01,#csvbStatsByVesselObsPanelV01,#csvbStatsTopRecurringBarsPanelV01,.csvb-group-bars-panel,.csvb-snp-bars-panel{padding:8px!important;margin-top:8px!important;}
      .csvb-stats-compare-v03-card,.csvb-composition-v02-card,.csvb-by-vessel-card,.csvb-recurring-card,.csvb-group-bars-panel,.csvb-snp-bars-panel{min-height:0!important;}
      .csvb-recurring-controls,.csvb-by-vessel-controls,.csvb-group-bars-controls,.csvb-snp-controls,.csvb-composition-v02-controls,.csvb-chapter-share-controls{gap:6px!important;margin-bottom:6px!important;}
      .csvb-recurring-type-box,.csvb-recurring-year-box,.csvb-by-vessel-type-box,.csvb-by-vessel-year-box,.csvb-group-bars-type-box,.csvb-snp-box,.csvb-composition-v02-type-box,.csvb-chapter-share-type-box,.csvb-stats-compare-v03-options{padding:5px 7px!important;gap:4px 8px!important;min-height:0!important;max-height:none!important;align-items:center!important;}
      .csvb-recurring-check,.csvb-by-vessel-check,.csvb-group-bars-check,.csvb-snp-check,.csvb-composition-v02-check,.csvb-chapter-share-check{font-size:.86rem!important;line-height:1.15!important;margin:0!important;}
      .csvb-recurring-field select,.csvb-by-vessel-field select,.csvb-group-bars-field select,.csvb-snp-field select,.csvb-composition-v02-field select,.csvb-chapter-share-field select{min-height:34px!important;padding:5px 8px!important;}

      /* Keep chart areas compact without crushing readability */
      .csvb-recurring-bars,.csvb-by-vessel-bars,.csvb-group-bars,.csvb-snp-bars{min-height:210px!important;padding-top:4px!important;}
      .csvb-recurring-bar-shell,.csvb-by-vessel-bar-shell,.csvb-group-bar-shell,.csvb-snp-shell{height:150px!important;}
      .csvb-recurring-bar-value,.csvb-by-vessel-bar-value,.csvb-group-bar-value,.csvb-snp-value{min-height:22px!important;}

      /* Full readable legends: no ellipsis, wrap full sentence/text */
      .csvb-recurring-legend,.csvb-by-vessel-legend,.csvb-group-legend,.csvb-snp-legend,.csvb-chapter-share-legend,.csvb-composition-v02-legend{gap:5px 14px!important;align-items:start!important;}
      .csvb-recurring-legend-row,.csvb-by-vessel-legend-row,.csvb-group-legend-row,.csvb-snp-legend-row,.csvb-chapter-share-legend-row,.csvb-composition-v02-legend-row{grid-template-columns:12px minmax(0,1fr) auto!important;align-items:start!important;line-height:1.25!important;}
      .csvb-recurring-label,.csvb-by-vessel-label,.csvb-group-label,.csvb-snp-legend-label,.csvb-chapter-share-label,.csvb-composition-v02-label{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;display:block!important;line-height:1.25!important;word-break:normal!important;overflow-wrap:anywhere!important;}
      .csvb-recurring-value,.csvb-by-vessel-value,.csvb-group-value,.csvb-snp-legend-value,.csvb-chapter-share-value,.csvb-composition-v02-value{white-space:nowrap!important;padding-left:8px!important;}

      /* Let horizontal graph labels remain compact while full wording appears in legend below */
      .csvb-recurring-bar-label,.csvb-by-vessel-bar-label,.csvb-group-bar-label,.csvb-snp-label{line-height:1.15!important;}

      @media(max-width:900px){
        .statGrid{grid-template-columns:1fr!important;}
        .csvb-recurring-legend-row,.csvb-by-vessel-legend-row,.csvb-group-legend-row,.csvb-snp-legend-row,.csvb-chapter-share-legend-row,.csvb-composition-v02-legend-row{grid-template-columns:12px minmax(0,1fr)!important;}
        .csvb-recurring-value,.csvb-by-vessel-value,.csvb-group-value,.csvb-snp-legend-value,.csvb-chapter-share-value,.csvb-composition-v02-value{grid-column:2!important;padding-left:0!important;}
      }
    `;
    document.head.appendChild(style);
  }

  function start() { injectStyle(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once:true }); else start();
})();
