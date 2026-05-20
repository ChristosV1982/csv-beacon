/* public/risq-questions-viewer-polish.js */
/* C.S.V. BEACON – RISQ Questions Viewer SIRE-style visual polish */
/* Frontend-only. No data or backend changes. */

(() => {
  "use strict";

  const BUILD = "RISQ-VIEWER-POLISH-20260520_2";
  window.CSVB_RISQ_VIEWER_POLISH_BUILD = BUILD;

  function $(id) {
    return document.getElementById(id);
  }

  function injectStyles() {
    if ($("csvbRisqViewerPolishStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbRisqViewerPolishStyles";
    style.textContent = `
      html[data-csvb-page="risq-questions-viewer.html"] body {
        background: #F4F8FC !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .topbar {
        min-height: 52px !important;
        padding: 8px 12px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .wrap {
        padding: 0 4px 14px !important;
        max-width: none !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .viewer-helper {
        margin: 4px auto 5px !important;
        padding: 6px 8px !important;
        min-height: 48px !important;
        border-radius: 12px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .viewer-title {
        font-size: 14px !important;
        font-weight: 900 !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .viewer-note {
        font-size: 12px !important;
        line-height: 1.22 !important;
        margin-top: 1px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .viewer-actions {
        gap: 6px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .viewer-pill {
        min-height: 27px !important;
        padding: 4px 9px !important;
        font-size: 12px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .stats-grid {
        grid-template-columns: repeat(6, minmax(112px, 1fr)) !important;
        gap: 7px !important;
        margin: 5px 0 6px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .stat-card {
        min-height: 38px !important;
        padding: 6px 8px !important;
        border-radius: 11px !important;
        box-shadow: none !important;
        border-left-width: 4px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .stat-label {
        font-size: 10.5px !important;
        line-height: 1.1 !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .stat-value {
        font-size: 17px !important;
        margin-top: 3px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .filter-panel {
        margin-top: 6px !important;
        margin-bottom: 7px !important;
        padding: 7px 8px !important;
        border-radius: 12px !important;
        background: #F7FAFE !important;
        box-shadow: none !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .filter-grid {
        grid-template-columns: auto repeat(5, minmax(125px, 1fr)) minmax(260px, 1.4fr) auto !important;
        gap: 7px !important;
        align-items: end !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .filter-title {
        align-self: center !important;
        font-size: 12px !important;
        padding: 0 4px 0 0 !important;
        color: #062A5E !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] label.field {
        gap: 3px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] label.field span {
        font-size: 11px !important;
        font-weight: 850 !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] input,
      html[data-csvb-page="risq-questions-viewer.html"] select,
      html[data-csvb-page="risq-questions-viewer.html"] .csvb-checkdrop-button {
        min-height: 31px !important;
        border-radius: 9px !important;
        padding-top: 5px !important;
        padding-bottom: 5px !important;
        font-size: 12px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .top-action-toolbar {
        align-items: flex-end !important;
        justify-content: flex-end !important;
        gap: 7px !important;
        min-width: 330px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .top-action-toolbar #risqAiLauncher {
        order: 1 !important;
        min-width: 105px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .top-action-toolbar #printExportMenu {
        order: 2 !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .top-action-toolbar #clearFiltersBtn {
        order: 3 !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .btn,
      html[data-csvb-page="risq-questions-viewer.html"] .btn2 {
        padding: 7px 10px !important;
        min-height: 31px !important;
        border-radius: 9px !important;
        font-size: 12px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .main-grid {
        grid-template-columns: 380px 1fr !important;
        gap: 10px !important;
        margin-top: 6px !important;
        padding: 0 !important;
        background: transparent !important;
        border: none !important;
        box-shadow: none !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .list-card,
      html[data-csvb-page="risq-questions-viewer.html"] .detail-card {
        border-radius: 12px !important;
        box-shadow: 0 8px 20px rgba(3,27,63,.045) !important;
        overflow: hidden !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .list-head,
      html[data-csvb-page="risq-questions-viewer.html"] .detail-head {
        padding: 8px 9px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .section-title {
        font-size: 14px !important;
        font-weight: 900 !important;
        color: #062A5E !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .section-meta {
        font-size: 11.5px !important;
        line-height: 1.25 !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .q-list {
        min-height: 0 !important;
        max-height: calc(100vh - 315px) !important;
        padding: 7px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .q-item {
        padding: 8px 9px !important;
        margin-bottom: 7px !important;
        border-radius: 11px !important;
        background: #FFFFFF !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .q-item.active {
        background: #EFF7FF !important;
        border-color: #0097A7 !important;
        box-shadow: inset 0 0 0 1px rgba(0,151,167,.35) !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .q-no {
        font-size: 13px !important;
        color: #062A5E !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .q-sub {
        font-size: 12px !important;
        font-weight: 750 !important;
        line-height: 1.28 !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .q-mini {
        font-size: 10.5px !important;
        line-height: 1.24 !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .detail-body {
        min-height: 0 !important;
        max-height: calc(100vh - 315px) !important;
        padding: 9px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .detail-number {
        font-size: 20px !important;
        font-weight: 950 !important;
        color: #062A5E !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .detail-question {
        margin-top: 8px !important;
        border: 1px solid #D6E4F5 !important;
        border-radius: 11px !important;
        background: #FFFFFF !important;
        padding: 8px 10px !important;
        font-size: 13px !important;
        font-weight: 850 !important;
        line-height: 1.38 !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .pill-row {
        gap: 5px !important;
        margin-top: 6px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .pill {
        min-height: 20px !important;
        padding: 2px 7px !important;
        font-size: 10.5px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .info-grid {
        grid-template-columns: repeat(3, minmax(160px, 1fr)) !important;
        gap: 7px !important;
        margin-top: 8px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .info-box {
        border-radius: 11px !important;
        padding: 7px 8px !important;
        background: #F9FCFF !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .info-label {
        font-size: 10.5px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .info-value {
        font-size: 12px !important;
        font-weight: 850 !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .content-section {
        margin-top: 8px !important;
        border-radius: 11px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .content-section-title {
        padding: 7px 9px !important;
        background: #F1F7FF !important;
        color: #062A5E !important;
        font-size: 13px !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .content-section-body {
        padding: 8px 9px !important;
        font-size: 12.5px !important;
        line-height: 1.38 !important;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .action-menu-panel {
        border-radius: 12px !important;
        min-width: 250px !important;
      }

      @media (max-width: 1320px) {
        html[data-csvb-page="risq-questions-viewer.html"] .filter-grid {
          grid-template-columns: repeat(3, minmax(160px, 1fr)) !important;
        }

        html[data-csvb-page="risq-questions-viewer.html"] .filter-title {
          grid-column: 1 / -1 !important;
        }

        html[data-csvb-page="risq-questions-viewer.html"] .top-action-toolbar {
          min-width: 0 !important;
          grid-column: 1 / -1 !important;
          justify-content: flex-end !important;
        }
      }

      @media (max-width: 1050px) {
        html[data-csvb-page="risq-questions-viewer.html"] .main-grid {
          grid-template-columns: 1fr !important;
        }

        html[data-csvb-page="risq-questions-viewer.html"] .q-list,
        html[data-csvb-page="risq-questions-viewer.html"] .detail-body {
          max-height: 520px !important;
        }
      }

      @media (max-width: 760px) {
        html[data-csvb-page="risq-questions-viewer.html"] .stats-grid,
        html[data-csvb-page="risq-questions-viewer.html"] .filter-grid,
        html[data-csvb-page="risq-questions-viewer.html"] .info-grid {
          grid-template-columns: 1fr !important;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function moveActionOrder() {
    const toolbar = document.querySelector(".top-action-toolbar");
    const ai = document.getElementById("risqAiLauncher");
    const menu = document.getElementById("printExportMenu");
    const clear = document.getElementById("clearFiltersBtn");

    if (!toolbar) return;
    if (ai && ai.parentElement !== toolbar) toolbar.appendChild(ai);
    if (menu && menu.parentElement !== toolbar) toolbar.appendChild(menu);
    if (clear && clear.parentElement !== toolbar) toolbar.appendChild(clear);
  }

  function ensureAccessDiagnosticLoaded() {
    if (window.CSVB_RISQ_VIEWER_ACCESS_DIAGNOSTIC_BUILD) return;
    if (document.querySelector('script[data-csvb-risq-access-diagnostic-loader="1"]')) return;

    const script = document.createElement("script");
    script.src = "./risq-questions-viewer-access-diagnostic.js?v=20260520_1";
    script.defer = true;
    script.dataset.csvbRisqAccessDiagnosticLoader = "1";
    document.body.appendChild(script);
  }

  function apply() {
    injectStyles();
    moveActionOrder();
    ensureAccessDiagnosticLoaded();
  }

  function boot() {
    apply();
    setTimeout(apply, 500);
    setTimeout(apply, 1500);
    setTimeout(apply, 3000);

    window.CSVB_RISQ_VIEWER_POLISH = {
      build: BUILD,
      apply,
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 500));
  } else {
    setTimeout(boot, 500);
  }
})();
