// public/csvb-dashboard-status-pills.js
// C.S.V. BEACON — Compact Dashboard Status Pills
// Replaces large dashboard-only Offline Diagnostics / Registered Device panels with compact one-line pills.
// Full detail remains available on dedicated pages.

(() => {
  "use strict";

  const BUILD = "DASHBOARD-STATUS-PILLS-2026-05-28-RECOVERY-1";
  const ROW_ID = "csvbDashboardStatusPillsRow";
  const DIAG_PILL_ID = "csvbDashboardDiagnosticsPill";
  const DEV_PILL_ID = "csvbDashboardDevicePill";

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function tileValue(cardId, labelText) {
    const card = document.getElementById(cardId);
    if (!card) return "";
    const labels = Array.from(card.querySelectorAll(".csvb-offline-diag-label,.csvb-device-label"));
    const label = labels.find((el) => String(el.textContent || "").trim().toLowerCase() === String(labelText).toLowerCase());
    return label?.parentElement?.querySelector(".csvb-offline-diag-value,.csvb-device-value")?.textContent?.trim() || "";
  }

  function ensureStyles() {
    if (document.getElementById("csvbDashboardStatusPillsStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbDashboardStatusPillsStyles";
    style.textContent = `
      #${ROW_ID} {
        display: flex;
        align-items: center;
        gap: 8px;
        flex-wrap: nowrap;
        overflow-x: auto;
        margin: 0 0 10px 0;
        padding: 2px 0 4px 0;
      }

      #${ROW_ID} .csvb-status-pill {
        min-height: 34px;
        display: inline-flex;
        align-items: center;
        gap: 8px;
        border: 1px solid #B8DCE8;
        border-radius: 999px;
        background: #FFFFFF;
        color: #062A5E;
        padding: 6px 10px;
        font-family: Arial, Helvetica, sans-serif;
        font-size: 12px;
        font-weight: 850;
        box-shadow: 0 6px 16px rgba(3,27,63,.08);
        white-space: nowrap;
        cursor: pointer;
        user-select: none;
      }

      #${ROW_ID} .csvb-status-pill:hover {
        border-color: #00A6B7;
        box-shadow: 0 8px 20px rgba(3,27,63,.12);
      }

      #${ROW_ID} .csvb-status-pill.ok {
        border-color: #B8E7C8;
        background: #EAF9EF;
        color: #087334;
      }

      #${ROW_ID} .csvb-status-pill.warn {
        border-color: #F6D58F;
        background: #FFF6E0;
        color: #8A5A00;
      }

      #${ROW_ID} .csvb-status-pill.err {
        border-color: #F2B7B7;
        background: #FFEAEA;
        color: #9B1C1C;
      }

      #${ROW_ID} .csvb-status-pill-dot {
        width: 9px;
        height: 9px;
        border-radius: 999px;
        background: currentColor;
        box-shadow: 0 0 0 3px rgba(255,255,255,.65);
        flex: 0 0 auto;
      }

      #${ROW_ID} .csvb-status-pill-label {
        font-weight: 950;
      }

      #${ROW_ID} .csvb-status-pill-meta {
        color: inherit;
        opacity: .82;
        font-weight: 750;
      }

      #csvbOfflineDiagnosticsCard.csvb-dashboard-panel-collapsed,
      #csvbDeviceContextCard.csvb-dashboard-panel-collapsed {
        display: none !important;
      }

      @media (max-width: 850px) {
        #${ROW_ID} {
          flex-wrap: nowrap;
          padding-bottom: 6px;
        }
        #${ROW_ID} .csvb-status-pill {
          font-size: 11px;
          min-height: 32px;
        }
      }
    `;

    document.head.appendChild(style);
  }

  function ensureRow() {
    let row = document.getElementById(ROW_ID);
    if (row) return row;

    row = document.createElement("div");
    row.id = ROW_ID;
    row.setAttribute("aria-label", "Dashboard status shortcuts");

    const wrap = document.querySelector(".wrap");
    const warn = document.getElementById("warnBox");

    if (warn?.parentElement) {
      warn.parentElement.insertBefore(row, warn.nextSibling);
    } else if (wrap) {
      wrap.prepend(row);
    } else {
      document.body.prepend(row);
    }

    return row;
  }

  function pillHtml(id, cls, title, meta, href) {
    return `
      <button id="${esc(id)}" class="csvb-status-pill ${esc(cls)}" type="button" data-href="${esc(href)}" title="Open details">
        <span class="csvb-status-pill-dot" aria-hidden="true"></span>
        <span class="csvb-status-pill-label">${esc(title)}</span>
        <span class="csvb-status-pill-meta">${esc(meta)}</span>
      </button>
    `;
  }

  function collapseLargePanels() {
    document.getElementById("csvbOfflineDiagnosticsCard")?.classList.add("csvb-dashboard-panel-collapsed");
    document.getElementById("csvbDeviceContextCard")?.classList.add("csvb-dashboard-panel-collapsed");
  }

  function diagnosticsSummary() {
    const connection = tileValue("csvbOfflineDiagnosticsCard", "Connection") || (navigator.onLine ? "Online" : "Offline");
    const serviceWorker = tileValue("csvbOfflineDiagnosticsCard", "Service Worker") || "—";
    const queue = tileValue("csvbOfflineDiagnosticsCard", "Pending Operations") || "0";
    const controlled = serviceWorker.toLowerCase().includes("controlled: yes");
    const cls = !navigator.onLine ? "warn" : controlled ? "ok" : "warn";
    return {
      cls,
      meta: `${connection} • SW ${controlled ? "Yes" : "No"} • Queue ${queue}`
    };
  }

  function deviceSummary() {
    const status = tileValue("csvbDeviceContextCard", "Status") || "not checked";
    const access = tileValue("csvbDeviceContextCard", "Access Allowed") || "—";
    const offline = tileValue("csvbDeviceContextCard", "Offline Allowed") || "No";
    const modules = tileValue("csvbDeviceContextCard", "Offline Modules") || "—";
    const s = status.toLowerCase();
    const cls = s === "approved" ? "ok" : s === "pending" || s === "not checked" || s === "not_registered" ? "warn" : "err";
    const needsRecovery = s === "not_registered";
    return {
      cls,
      meta: needsRecovery
        ? `${status} • click to recover in Registered Devices`
        : `${status} • Access ${access} • Offline ${offline}${offline === "Yes" && modules !== "—" ? " " + modules : ""}`,
      href: needsRecovery ? "./su-admin.html" : "./registered_device.html"
    };
  }

  function renderPills() {
    ensureStyles();
    const row = ensureRow();
    collapseLargePanels();

    const diag = diagnosticsSummary();
    const dev = deviceSummary();

    row.innerHTML = [
      pillHtml(DIAG_PILL_ID, diag.cls, "Offline Diagnostics", diag.meta, "./offline_diagnostics.html"),
      pillHtml(DEV_PILL_ID, dev.cls, "Registered Device", dev.meta, dev.href || "./registered_device.html")
    ].join("");

    row.querySelectorAll("button[data-href]").forEach((btn) => {
      btn.addEventListener("click", () => {
        location.href = btn.getAttribute("data-href");
      });
    });
  }

  function boot() {
    window.CSVB_DASHBOARD_STATUS_PILLS_BUILD = BUILD;
    renderPills();

    [250, 750, 1500, 3000, 6000, 10000].forEach((ms) => setTimeout(renderPills, ms));
    setInterval(renderPills, 15000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
