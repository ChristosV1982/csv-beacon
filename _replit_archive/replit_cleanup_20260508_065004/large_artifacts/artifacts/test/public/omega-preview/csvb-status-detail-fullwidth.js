// public/csvb-status-detail-fullwidth.js
// C.S.V. BEACON — Status Detail Full-Width Fit
// Forces registered-device/offline-diagnostics detail pages to use the available viewport width.
// Visual only. No data writes. No sync execution.

(() => {
  "use strict";

  const BUILD = "STATUS-DETAIL-FULLWIDTH-2026-05-26-U01";

  function ensureStyles() {
    if (document.getElementById("csvbStatusDetailFullWidthStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbStatusDetailFullWidthStyles";
    style.textContent = `
      html,
      body {
        overflow-x: hidden !important;
      }

      main.wrap,
      .wrap {
        max-width: none !important;
        width: calc(100vw - 20px) !important;
        margin-left: auto !important;
        margin-right: auto !important;
        padding-left: 10px !important;
        padding-right: 10px !important;
        box-sizing: border-box !important;
      }

      .pageTitle,
      #csvbRegisteredDeviceCompactRoot,
      #csvbOfflineDiagnosticsCompactRoot {
        max-width: none !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }

      #csvbRegisteredDeviceCompactRoot,
      #csvbOfflineDiagnosticsCompactRoot {
        padding: 10px !important;
      }

      #csvbRegisteredDeviceCompactRoot .csvb-registered-device-table-wrap,
      #csvbOfflineDiagnosticsCompactRoot .wrap {
        overflow-x: hidden !important;
        width: 100% !important;
        box-sizing: border-box !important;
      }

      #csvbRegisteredDeviceCompactRoot table,
      #csvbOfflineDiagnosticsCompactRoot table {
        min-width: 0 !important;
        width: 100% !important;
        table-layout: fixed !important;
      }

      #csvbRegisteredDeviceCompactRoot th,
      #csvbRegisteredDeviceCompactRoot td,
      #csvbOfflineDiagnosticsCompactRoot th,
      #csvbOfflineDiagnosticsCompactRoot td {
        padding: 6px 5px !important;
        font-size: 11px !important;
        line-height: 1.18 !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      #csvbRegisteredDeviceCompactRoot .csvb-device-status-pill,
      #csvbOfflineDiagnosticsCompactRoot .pill {
        padding: 2px 7px !important;
        font-size: 10.5px !important;
        max-width: 100% !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
      }

      #csvbRegisteredDeviceCompactRoot .csvb-registered-device-note,
      #csvbOfflineDiagnosticsCompactRoot .note,
      .pageTitle p {
        font-size: 12px !important;
      }

      #csvbRegisteredDeviceCompactRoot .csvb-registered-device-toolbar,
      #csvbOfflineDiagnosticsCompactRoot .head {
        margin-bottom: 8px !important;
      }

      #csvbRegisteredDeviceCompactRoot .csvb-registered-device-controls input,
      #csvbRegisteredDeviceCompactRoot .csvb-registered-device-controls select,
      #csvbRegisteredDeviceCompactRoot .csvb-registered-device-controls button,
      #csvbOfflineDiagnosticsCompactRoot button {
        min-height: 28px !important;
        padding: 5px 8px !important;
        font-size: 12px !important;
      }

      /* Registered device table: force all columns into the viewport. */
      #csvbRegisteredDeviceCompactRoot th:nth-child(1),
      #csvbRegisteredDeviceCompactRoot td:nth-child(1) { width: 7% !important; }
      #csvbRegisteredDeviceCompactRoot th:nth-child(2),
      #csvbRegisteredDeviceCompactRoot td:nth-child(2) { width: 8% !important; }
      #csvbRegisteredDeviceCompactRoot th:nth-child(3),
      #csvbRegisteredDeviceCompactRoot td:nth-child(3) { width: 10% !important; }
      #csvbRegisteredDeviceCompactRoot th:nth-child(4),
      #csvbRegisteredDeviceCompactRoot td:nth-child(4) { width: 6% !important; }
      #csvbRegisteredDeviceCompactRoot th:nth-child(5),
      #csvbRegisteredDeviceCompactRoot td:nth-child(5) { width: 7% !important; }
      #csvbRegisteredDeviceCompactRoot th:nth-child(6),
      #csvbRegisteredDeviceCompactRoot td:nth-child(6) { width: 6% !important; }
      #csvbRegisteredDeviceCompactRoot th:nth-child(7),
      #csvbRegisteredDeviceCompactRoot td:nth-child(7) { width: 13% !important; }
      #csvbRegisteredDeviceCompactRoot th:nth-child(8),
      #csvbRegisteredDeviceCompactRoot td:nth-child(8) { width: 6% !important; }
      #csvbRegisteredDeviceCompactRoot th:nth-child(9),
      #csvbRegisteredDeviceCompactRoot td:nth-child(9) { width: 11% !important; }
      #csvbRegisteredDeviceCompactRoot th:nth-child(10),
      #csvbRegisteredDeviceCompactRoot td:nth-child(10) { width: 8% !important; }
      #csvbRegisteredDeviceCompactRoot th:nth-child(11),
      #csvbRegisteredDeviceCompactRoot td:nth-child(11) { width: 8% !important; }
      #csvbRegisteredDeviceCompactRoot th:nth-child(12),
      #csvbRegisteredDeviceCompactRoot td:nth-child(12) { width: 10% !important; }

      /* Offline diagnostics table: force all columns into the viewport. */
      #csvbOfflineDiagnosticsCompactRoot th:nth-child(1),
      #csvbOfflineDiagnosticsCompactRoot td:nth-child(1) { width: 8% !important; }
      #csvbOfflineDiagnosticsCompactRoot th:nth-child(2),
      #csvbOfflineDiagnosticsCompactRoot td:nth-child(2) { width: 13% !important; }
      #csvbOfflineDiagnosticsCompactRoot th:nth-child(3),
      #csvbOfflineDiagnosticsCompactRoot td:nth-child(3) { width: 13% !important; }
      #csvbOfflineDiagnosticsCompactRoot th:nth-child(4),
      #csvbOfflineDiagnosticsCompactRoot td:nth-child(4) { width: 5% !important; }
      #csvbOfflineDiagnosticsCompactRoot th:nth-child(5),
      #csvbOfflineDiagnosticsCompactRoot td:nth-child(5) { width: 13% !important; }
      #csvbOfflineDiagnosticsCompactRoot th:nth-child(6),
      #csvbOfflineDiagnosticsCompactRoot td:nth-child(6) { width: 6% !important; }
      #csvbOfflineDiagnosticsCompactRoot th:nth-child(7),
      #csvbOfflineDiagnosticsCompactRoot td:nth-child(7) { width: 6% !important; }
      #csvbOfflineDiagnosticsCompactRoot th:nth-child(8),
      #csvbOfflineDiagnosticsCompactRoot td:nth-child(8) { width: 18% !important; }
      #csvbOfflineDiagnosticsCompactRoot th:nth-child(9),
      #csvbOfflineDiagnosticsCompactRoot td:nth-child(9) { width: 6% !important; }
      #csvbOfflineDiagnosticsCompactRoot th:nth-child(10),
      #csvbOfflineDiagnosticsCompactRoot td:nth-child(10) { width: 12% !important; }
    `;

    document.head.appendChild(style);
  }

  function compactRegisteredDeviceCells() {
    const root = document.getElementById("csvbRegisteredDeviceCompactRoot");
    if (!root) return;

    root.querySelectorAll("td").forEach((td) => {
      const txt = String(td.textContent || "").trim();
      if (!td.title && txt) td.title = txt;
    });

    root.querySelectorAll("td:nth-child(9)").forEach((td) => {
      const raw = String(td.textContent || "").trim();
      if (raw === "SIRE_QUESTIONS_VIEWER") td.textContent = "SIRE Viewer";
    });

    root.querySelectorAll("td:nth-child(10),td:nth-child(11),td:nth-child(12)").forEach((td) => {
      const raw = String(td.textContent || "").trim();
      const m = raw.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})/);
      if (m) td.textContent = `${m[1]} ${m[2]}`;
    });
  }

  function compactOfflineCells() {
    const root = document.getElementById("csvbOfflineDiagnosticsCompactRoot");
    if (!root) return;

    root.querySelectorAll("td").forEach((td) => {
      const txt = String(td.textContent || "").trim();
      if (!td.title && txt) td.title = txt;
    });
  }

  function tick() {
    ensureStyles();
    compactRegisteredDeviceCells();
    compactOfflineCells();
  }

  function boot() {
    window.CSVB_STATUS_DETAIL_FULLWIDTH_BUILD = BUILD;
    tick();
    [200, 600, 1200, 2500, 5000].forEach((ms) => setTimeout(tick, ms));
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
