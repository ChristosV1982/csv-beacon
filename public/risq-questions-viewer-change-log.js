// public/risq-questions-viewer-change-log.js
// C.S.V. BEACON — RISQ Questions Viewer change log panel
// Viewer-only helper. Read-only. No RISQ data writes.

(() => {
  "use strict";

  const BUILD = "RISQ-VIEWER-CHANGE-LOG-20260520_1";
  const LS_OPEN = "csvb_risq_viewer_change_log_open";

  window.CSVB_RISQ_VIEWER_CHANGE_LOG_BUILD = BUILD;

  const state = {
    sb: null,
    me: null,
    events: [],
    isOpen: false
  };

  function $(id) {
    return document.getElementById(id);
  }

  function safeStr(value) {
    return value === null || value === undefined ? "" : String(value);
  }

  function esc(value) {
    return safeStr(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function role() {
    return safeStr(state.me?.profile?.role || "");
  }

  function isPlatformRole() {
    const r = role();
    return r === "super_admin" || r === "platform_owner";
  }

  function fmtDate(value) {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString();
    } catch (_) {
      return safeStr(value);
    }
  }

  function loadOpenState() {
    try {
      return localStorage.getItem(LS_OPEN) === "1";
    } catch (_) {
      return false;
    }
  }

  function saveOpenState(value) {
    try {
      localStorage.setItem(LS_OPEN, value ? "1" : "0");
    } catch (_) {}
  }

  function toastOk(message) {
    const ok = $("okBox");
    const warn = $("warnBox");
    if (warn) warn.style.display = "none";
    if (!ok) return;
    ok.textContent = message || "";
    ok.style.display = message ? "block" : "none";
    if (message) {
      setTimeout(() => {
        if (ok.textContent === message) {
          ok.textContent = "";
          ok.style.display = "none";
        }
      }, 2600);
    }
  }

  function toastWarn(message) {
    const warn = $("warnBox");
    const ok = $("okBox");
    if (ok) ok.style.display = "none";
    if (!warn) return;
    warn.textContent = message || "";
    warn.style.display = message ? "block" : "none";
  }

  function injectStyles() {
    if ($("csvbRisqViewerChangeLogStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbRisqViewerChangeLogStyles";
    style.textContent = `
      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-trigger {
        width: 100%;
        margin: 5px auto 6px;
        display: none;
        align-items: center;
        justify-content: flex-start;
        gap: 7px;
        flex-wrap: wrap;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-trigger .btn,
      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-trigger .btn2 {
        padding: 6px 10px;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-panel {
        width: 100%;
        max-width: 100%;
        margin: 8px auto 10px;
        border: 1px solid #C7D8F0;
        background: #F8FBFF;
        border-radius: 12px;
        box-shadow: 0 8px 20px rgba(3,27,63,.05);
        padding: 9px 12px;
        display: none;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-title {
        color: #062A5E;
        font-weight: 850;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-subtitle {
        color: #5E6F86;
        font-size: 12px;
        margin-top: 2px;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-actions {
        display: inline-flex;
        gap: 7px;
        align-items: center;
        flex-wrap: wrap;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-list {
        margin-top: 9px;
        display: grid;
        gap: 8px;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-item {
        border: 1px solid #D6E4F5;
        background: #FFFFFF;
        border-radius: 10px;
        padding: 8px 9px;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-item-top {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: start;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-event-title {
        color: #062A5E;
        font-weight: 850;
        line-height: 1.25;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-meta {
        color: #5E6F86;
        font-size: 12px;
        margin-top: 4px;
        line-height: 1.35;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-summary {
        color: #10233F;
        margin-top: 6px;
        line-height: 1.35;
        white-space: pre-wrap;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-counts {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 7px;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #BFD3EF;
        background: #EEF6FF;
        color: #1A4170;
        border-radius: 999px;
        padding: 4px 8px;
        font-weight: 800;
        font-size: 11px;
        white-space: nowrap;
      }

      html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-muted {
        color: #5E6F86;
      }

      @media (max-width: 900px) {
        html[data-csvb-page="risq-questions-viewer.html"] .csvb-risq-change-log-item-top {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function insertionAnchor() {
    return document.querySelector(".viewer-helper");
  }

  function ensurePanel() {
    if ($("csvbRisqViewerChangeLogPanel")) return;

    const anchor = insertionAnchor();

    const trigger = document.createElement("div");
    trigger.id = "csvbRisqViewerChangeLogTrigger";
    trigger.className = "csvb-risq-change-log-trigger";
    trigger.innerHTML = `
      <button id="csvbRisqViewerChangeLogToggleBtn" class="btn2" type="button">Changes Log</button>
    `;

    const panel = document.createElement("div");
    panel.id = "csvbRisqViewerChangeLogPanel";
    panel.className = "csvb-risq-change-log-panel";
    panel.innerHTML = `
      <div class="csvb-risq-change-log-head">
        <div>
          <div class="csvb-risq-change-log-title">RISQ Library Change Log</div>
          <div class="csvb-risq-change-log-subtitle">Platform monitoring log for RISQ Questions Viewer content-change events.</div>
        </div>
        <div class="csvb-risq-change-log-actions">
          <span class="csvb-risq-change-log-pill" id="csvbRisqViewerChangeLogCount">Events: 0</span>
          <button id="csvbRisqViewerChangeLogRefreshBtn" class="btn2" type="button">Refresh log</button>
          <button id="csvbRisqViewerChangeLogCloseBtn" class="btn2" type="button">Close log</button>
        </div>
      </div>
      <div class="csvb-risq-change-log-list" id="csvbRisqViewerChangeLogList"></div>
    `;

    if (anchor) {
      anchor.insertAdjacentElement("afterend", panel);
      anchor.insertAdjacentElement("afterend", trigger);
    } else {
      document.body.prepend(panel);
      document.body.prepend(trigger);
    }

    $("csvbRisqViewerChangeLogToggleBtn")?.addEventListener("click", () => setOpen(!state.isOpen));
    $("csvbRisqViewerChangeLogCloseBtn")?.addEventListener("click", () => setOpen(false));
    $("csvbRisqViewerChangeLogRefreshBtn")?.addEventListener("click", () => loadLog(true));
  }

  function setOpen(value) {
    state.isOpen = !!value;
    saveOpenState(state.isOpen);
    renderLog();
    if (state.isOpen && !state.events.length) loadLog(false);
  }

  function updateTriggerAndPanelShell() {
    const trigger = $("csvbRisqViewerChangeLogTrigger");
    const panel = $("csvbRisqViewerChangeLogPanel");
    const count = $("csvbRisqViewerChangeLogCount");
    const toggleBtn = $("csvbRisqViewerChangeLogToggleBtn");

    if (!trigger || !panel) return;

    if (!isPlatformRole()) {
      trigger.style.display = "none";
      panel.style.display = "none";
      return;
    }

    const rows = state.events || [];
    trigger.style.display = "flex";
    panel.style.display = state.isOpen ? "block" : "none";

    if (count) count.textContent = `Events: ${rows.length}`;
    if (toggleBtn) toggleBtn.textContent = state.isOpen ? "Hide Changes Log" : "Changes Log";
  }

  function renderLog() {
    ensurePanel();
    updateTriggerAndPanelShell();

    const list = $("csvbRisqViewerChangeLogList");
    if (!list || !isPlatformRole()) return;

    const rows = state.events || [];

    if (!rows.length) {
      list.innerHTML = `<div class="csvb-risq-change-log-muted">No RISQ library change events recorded yet.</div>`;
      return;
    }

    list.innerHTML = rows.map((e) => {
      const qno = safeStr(e.question_no || "");
      const changedBy = safeStr(e.created_by_username || e.created_by || "—");
      const company = safeStr(e.company_name || e.company_id || "—");
      const payloadKeys = e.payload && typeof e.payload === "object" ? Object.keys(e.payload).length : 0;

      return `
        <div class="csvb-risq-change-log-item" data-risq-event-id="${esc(e.event_id || "")}">
          <div class="csvb-risq-change-log-item-top">
            <div>
              <div class="csvb-risq-change-log-event-title">${esc(e.title || "RISQ Questions Viewer updated")}</div>
              <div class="csvb-risq-change-log-meta">
                ${esc(fmtDate(e.created_at))}
                ${qno ? " • RISQ " + esc(qno) : ""}
                ${e.change_scope ? " • Scope: " + esc(e.change_scope) : ""}
                ${e.event_type ? " • Type: " + esc(e.event_type) : ""}
                ${" • Changed by: " + esc(changedBy)}
                ${company !== "—" ? " • Company: " + esc(company) : ""}
              </div>
              ${e.summary ? `<div class="csvb-risq-change-log-summary">${esc(e.summary)}</div>` : ""}
              <div class="csvb-risq-change-log-counts">
                <span class="csvb-risq-change-log-pill">Payload fields: ${payloadKeys}</span>
                <span class="csvb-risq-change-log-pill">Source: ${esc(e.source_module || "—")}</span>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join("");
  }

  async function loadLog(showToast = false) {
    try {
      if (!state.sb || !isPlatformRole()) return;

      const { data, error } = await state.sb.rpc("csvb_risq_library_change_log_for_me", {
        p_limit: 20
      });

      if (error) throw error;

      state.events = Array.isArray(data) ? data : [];
      renderLog();

      if (showToast) toastOk(`RISQ library change log refreshed. Events: ${state.events.length}.`);
    } catch (error) {
      console.warn("RISQ library change log load failed:", error);
      renderLog();
      if (showToast) toastWarn("Could not load RISQ library change log: " + safeStr(error?.message || error));
    }
  }

  async function boot() {
    try {
      injectStyles();
      ensurePanel();

      if (!window.AUTH?.ensureSupabase || !window.AUTH?.getSessionUserProfile) return;

      state.sb = window.AUTH.ensureSupabase();
      state.me = await window.AUTH.getSessionUserProfile();
      state.isOpen = loadOpenState();

      if (!state.me?.session?.user) return;

      window.CSVB_RISQ_VIEWER_CHANGE_LOG = {
        build: BUILD,
        reload: loadLog,
        open: () => setOpen(true),
        close: () => setOpen(false),
        toggle: () => setOpen(!state.isOpen),
        getEvents: () => (state.events || []).slice()
      };

      if (!isPlatformRole()) {
        renderLog();
        return;
      }

      await loadLog(false);
    } catch (error) {
      console.warn("RISQ library change log boot failed:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 900));
  } else {
    setTimeout(boot, 900);
  }
})();
