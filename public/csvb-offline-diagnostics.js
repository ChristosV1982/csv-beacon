// public/csvb-offline-diagnostics.js
// C.S.V. BEACON — Offline Diagnostics Panel
// Phase 1 foundation only. Read-only diagnostics. No Supabase writes. No sync execution.

(() => {
  "use strict";

  const BUILD = "OFFLINE-DIAGNOSTICS-2026-05-26-PHASE1";
  const PANEL_ID = "csvbOfflineDiagnosticsCard";
  const BODY_ID = "csvbOfflineDiagnosticsBody";
  const STATUS_ID = "csvbOfflineDiagnosticsStatus";

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function boolText(value) {
    return value ? "Yes" : "No";
  }

  function setStatus(text, kind = "") {
    const el = document.getElementById(STATUS_ID);
    if (!el) return;
    el.textContent = text || "";
    el.className = "csvb-offline-diagnostics-status " + kind;
  }

  function ensureStyles() {
    if (document.getElementById("csvbOfflineDiagnosticsStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbOfflineDiagnosticsStyles";
    style.textContent = `
      #${PANEL_ID} {
        border: 1px solid #D6E4F5;
        border-radius: 14px;
        background: #FFFFFF;
        box-shadow: 0 10px 24px rgba(3,27,63,.08);
        padding: 12px;
        margin: 0 0 12px 0;
      }

      #${PANEL_ID} .csvb-offline-diagnostics-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      #${PANEL_ID} h2 {
        margin: 0;
        color: #062A5E;
        font-size: 1.02rem;
        font-weight: 900;
      }

      #${PANEL_ID} .csvb-offline-diagnostics-note {
        color: #5E6F86;
        font-size: .82rem;
        font-weight: 650;
        margin-top: 4px;
      }

      #${PANEL_ID} .csvb-offline-diagnostics-actions {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        flex-wrap: wrap;
      }

      #${PANEL_ID} button {
        border: 1px solid #AEE3F1;
        border-radius: 9px;
        background: #E9F7FB;
        color: #062A5E;
        padding: 6px 10px;
        font-weight: 850;
        cursor: pointer;
      }

      #${BODY_ID} {
        margin-top: 10px;
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
        gap: 8px;
      }

      #${PANEL_ID} .csvb-offline-diag-tile {
        border: 1px solid #E1ECF7;
        border-radius: 11px;
        background: #F7FAFE;
        padding: 8px 9px;
        min-height: 62px;
      }

      #${PANEL_ID} .csvb-offline-diag-label {
        color: #5E6F86;
        font-size: .75rem;
        font-weight: 750;
        margin-bottom: 4px;
      }

      #${PANEL_ID} .csvb-offline-diag-value {
        color: #062A5E;
        font-size: .92rem;
        font-weight: 900;
        overflow-wrap: anywhere;
      }

      #${PANEL_ID} .csvb-offline-diagnostics-status {
        color: #5E6F86;
        font-size: .78rem;
        font-weight: 750;
      }

      #${PANEL_ID} .csvb-offline-diagnostics-status.ok { color: #087334; }
      #${PANEL_ID} .csvb-offline-diagnostics-status.err { color: #9B1C1C; }
    `;

    document.head.appendChild(style);
  }

  function tile(label, value) {
    return `
      <div class="csvb-offline-diag-tile">
        <div class="csvb-offline-diag-label">${esc(label)}</div>
        <div class="csvb-offline-diag-value">${esc(value)}</div>
      </div>
    `;
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("section");
    panel.id = PANEL_ID;
    panel.innerHTML = `
      <div class="csvb-offline-diagnostics-head">
        <div>
          <h2>Offline Diagnostics</h2>
          <div class="csvb-offline-diagnostics-note">
            Phase 1 read-only checks. Offline sync is not active.
          </div>
        </div>
        <div class="csvb-offline-diagnostics-actions">
          <span id="${STATUS_ID}" class="csvb-offline-diagnostics-status">Not checked.</span>
          <button id="csvbOfflineDiagnosticsRefreshBtn" type="button">Refresh</button>
        </div>
      </div>
      <div id="${BODY_ID}"></div>
    `;

    const wrap = document.querySelector(".wrap");
    const warn = document.getElementById("warnBox");

    if (warn && warn.parentElement) {
      warn.parentElement.insertBefore(panel, warn.nextSibling);
    } else if (wrap) {
      wrap.prepend(panel);
    } else {
      document.body.appendChild(panel);
    }

    document.getElementById("csvbOfflineDiagnosticsRefreshBtn")?.addEventListener("click", refresh);

    return panel;
  }

  async function getCacheCount() {
    if (!window.caches?.keys) return "Unavailable";
    const keys = await caches.keys();
    return String(keys.length);
  }

  async function getServiceWorkerStatus() {
    if (!("serviceWorker" in navigator)) return "Unavailable";

    const regs = await navigator.serviceWorker.getRegistrations();
    const controlled = !!navigator.serviceWorker.controller;
    return `${regs.length} registration(s), controlled: ${boolText(controlled)}`;
  }

  async function refresh() {
    ensureStyles();
    ensurePanel();

    const body = document.getElementById(BODY_ID);
    if (!body) return;

    setStatus("Checking…");

    try {
      const offlineDbHealth = window.CSVB_OFFLINE_DB?.healthCheck
        ? await window.CSVB_OFFLINE_DB.healthCheck()
        : null;

      const syncQueueHealth = window.CSVB_SYNC_QUEUE?.healthCheck
        ? await window.CSVB_SYNC_QUEUE.healthCheck()
        : null;

      const swStatus = await getServiceWorkerStatus();
      const cacheCount = await getCacheCount();

      body.innerHTML = [
        tile("Connection", navigator.onLine ? "Online" : "Offline"),
        tile("Offline Status", window.CSVB_OFFLINE_STATUS_BUILD || "Not loaded"),
        tile("Offline DB", offlineDbHealth?.build || "Not loaded"),
        tile("Offline DB Stores", Array.isArray(offlineDbHealth?.stores) ? offlineDbHealth.stores.length : "—"),
        tile("Sync Queue", syncQueueHealth?.build || "Not loaded"),
        tile("Pending Operations", syncQueueHealth?.pending_count ?? "—"),
        tile("Total Queue Operations", syncQueueHealth?.total_operations ?? "—"),
        tile("Service Worker", swStatus),
        tile("Cache Storage", cacheCount + " cache(s)"),
        tile("Diagnostics", BUILD)
      ].join("");

      setStatus("Diagnostics OK.", "ok");
    } catch (error) {
      body.innerHTML = tile("Diagnostics Error", error?.message || String(error));
      setStatus("Diagnostics failed.", "err");
    }
  }

  function boot() {
    window.CSVB_OFFLINE_DIAGNOSTICS_BUILD = BUILD;
    ensureStyles();
    ensurePanel();
    setTimeout(refresh, 250);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
