// public/q-sire-questions-viewer-ai-usage-log.js
// C.S.V. BEACON — Viewer AI Usage Log panel
// Read-only frontend panel. Uses csvb_sire_viewer_ai_usage_log_for_me().
// Platform roles only. Supports SIRE, RISQ and legacy SIRE rows.

(() => {
  "use strict";

  const BUILD = "VIEWER-AI-USAGE-LOG-20260520_1";
  window.CSVB_SIRE_VIEWER_AI_USAGE_LOG_BUILD = BUILD;
  window.CSVB_VIEWER_AI_USAGE_LOG_BUILD = BUILD;

  const state = {
    sb: null,
    me: null,
    open: false,
    rows: [],
    viewerFilter: "ALL"
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

  function canSeePanel() {
    const r = role();
    return r === "super_admin" || r === "platform_owner";
  }

  function fmtDate(value) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString();
    } catch (_) {
      return safeStr(value);
    }
  }

  function fmtMs(value) {
    const n = Number(value || 0);
    if (!Number.isFinite(n) || n <= 0) return "—";
    if (n < 1000) return `${n} ms`;
    return `${(n / 1000).toFixed(1)} s`;
  }

  function viewerType(row) {
    const direct = safeStr(row.viewer_type || "").trim().toUpperCase();
    if (direct === "RISQ") return "RISQ";
    if (direct === "SIRE") return "SIRE";
    if (direct === "SIRE_LEGACY") return "SIRE_LEGACY";

    const ctx = row.request_context;
    if (ctx && typeof ctx === "object") {
      const v = safeStr(ctx.viewer_type || ctx.viewerType || "").trim().toUpperCase();
      if (v === "RISQ") return "RISQ";
      if (v === "SIRE") return "SIRE";
    }

    return "SIRE_LEGACY";
  }

  function viewerTypeLabel(type) {
    if (type === "RISQ") return "RISQ";
    if (type === "SIRE") return "SIRE";
    if (type === "SIRE_LEGACY") return "SIRE Legacy";
    return type || "Unknown";
  }

  function viewerPillClass(type) {
    if (type === "RISQ") return "csvb-ai-usage-viewer-risq";
    if (type === "SIRE") return "csvb-ai-usage-viewer-sire";
    return "csvb-ai-usage-viewer-legacy";
  }

  function filteredRows() {
    const filter = state.viewerFilter || "ALL";
    if (filter === "ALL") return state.rows.slice();
    return state.rows.filter((row) => viewerType(row) === filter);
  }

  function injectStyles() {
    if ($("csvbViewerAiUsageLogStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbViewerAiUsageLogStyles";
    style.textContent = `
      .csvb-ai-usage-trigger {
        width: 100%;
        margin: 5px auto 6px;
        display: none;
        align-items: center;
        justify-content: flex-start;
        gap: 7px;
        flex-wrap: wrap;
      }

      .csvb-ai-usage-panel {
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

      .csvb-ai-usage-head {
        display: flex;
        align-items: flex-start;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      .csvb-ai-usage-title {
        color: #062A5E;
        font-weight: 850;
      }

      .csvb-ai-usage-subtitle {
        color: #5E6F86;
        font-size: 12px;
        margin-top: 2px;
      }

      .csvb-ai-usage-actions {
        display: inline-flex;
        gap: 7px;
        align-items: center;
        flex-wrap: wrap;
      }

      .csvb-ai-usage-actions select {
        width: auto;
        min-height: 31px;
        border: 1px solid #BFD3EF;
        background: #FFFFFF;
        color: #062A5E;
        border-radius: 9px;
        padding: 5px 8px;
        font-size: 12px;
        font-weight: 800;
      }

      .csvb-ai-usage-pill,
      .csvb-ai-usage-viewer-pill {
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

      .csvb-ai-usage-viewer-sire {
        border-color: #BFD3EF;
        background: #EEF6FF;
        color: #1A4170;
      }

      .csvb-ai-usage-viewer-risq {
        border-color: #BDE8D0;
        background: #ECFDF3;
        color: #067647;
      }

      .csvb-ai-usage-viewer-legacy {
        border-color: #E7D7B3;
        background: #FFF8E8;
        color: #8A5A00;
      }

      .csvb-ai-usage-table-wrap {
        margin-top: 9px;
        overflow-x: auto;
        border: 1px solid #D6E4F5;
        border-radius: 10px;
        background: #fff;
      }

      .csvb-ai-usage-table {
        width: 100%;
        border-collapse: collapse;
        font-size: 12px;
      }

      .csvb-ai-usage-table th,
      .csvb-ai-usage-table td {
        border-bottom: 1px solid #E1EAF7;
        padding: 6px 8px;
        vertical-align: top;
        text-align: left;
      }

      .csvb-ai-usage-table th {
        background: #F1F7FF;
        color: #062A5E;
        font-weight: 850;
        white-space: nowrap;
      }

      .csvb-ai-usage-table td {
        color: #10233F;
      }

      .csvb-ai-usage-query {
        max-width: 320px;
        white-space: normal;
        word-break: break-word;
      }

      .csvb-ai-usage-muted {
        color: #5E6F86;
      }

      .csvb-ai-usage-status-ok {
        color: #067647;
        font-weight: 850;
      }

      .csvb-ai-usage-status-fail {
        color: #B42318;
        font-weight: 850;
      }
    `;

    document.head.appendChild(style);
  }

  function insertionAnchor() {
    return $("csvbSireViewerChangeLogTrigger") || $("csvbSireViewerAlertsPanel") || document.querySelector(".csvb-sire-viewer-helper") || document.querySelector(".viewer-helper");
  }

  function ensurePanel() {
    if ($("csvbAiUsageLogPanel")) return;

    const anchor = insertionAnchor();

    const trigger = document.createElement("div");
    trigger.id = "csvbAiUsageLogTrigger";
    trigger.className = "csvb-ai-usage-trigger";
    trigger.innerHTML = `
      <button id="csvbAiUsageLogToggleBtn" class="btn light" type="button">Viewer AI Usage Log</button>
    `;

    const panel = document.createElement("div");
    panel.id = "csvbAiUsageLogPanel";
    panel.className = "csvb-ai-usage-panel";
    panel.innerHTML = `
      <div class="csvb-ai-usage-head">
        <div>
          <div class="csvb-ai-usage-title">Viewer AI Usage Log</div>
          <div class="csvb-ai-usage-subtitle">Platform-only audit view of recent SIRE and RISQ Viewer AI Search requests.</div>
        </div>
        <div class="csvb-ai-usage-actions">
          <label class="csvb-ai-usage-muted" for="csvbAiUsageViewerFilter">Viewer</label>
          <select id="csvbAiUsageViewerFilter">
            <option value="ALL">All</option>
            <option value="SIRE">SIRE</option>
            <option value="RISQ">RISQ</option>
            <option value="SIRE_LEGACY">SIRE Legacy</option>
          </select>
          <span class="csvb-ai-usage-pill" id="csvbAiUsageLogCount">Rows: 0</span>
          <button id="csvbAiUsageLogRefreshBtn" class="btn light" type="button">Refresh log</button>
          <button id="csvbAiUsageLogCloseBtn" class="btn light" type="button">Close log</button>
        </div>
      </div>
      <div id="csvbAiUsageLogBody" class="csvb-ai-usage-table-wrap"></div>
    `;

    if (anchor) {
      anchor.insertAdjacentElement("afterend", panel);
      anchor.insertAdjacentElement("afterend", trigger);
    } else {
      document.body.prepend(panel);
      document.body.prepend(trigger);
    }

    $("csvbAiUsageLogToggleBtn")?.addEventListener("click", () => setOpen(!state.open));
    $("csvbAiUsageLogCloseBtn")?.addEventListener("click", () => setOpen(false));
    $("csvbAiUsageLogRefreshBtn")?.addEventListener("click", () => loadRows(true));
    $("csvbAiUsageViewerFilter")?.addEventListener("change", (ev) => {
      state.viewerFilter = ev.target.value || "ALL";
      render();
    });
  }

  function setOpen(value) {
    state.open = !!value;
    render();
    if (state.open && !state.rows.length) loadRows(false);
  }

  function renderShell() {
    const trigger = $("csvbAiUsageLogTrigger");
    const panel = $("csvbAiUsageLogPanel");

    if (!trigger || !panel) return;

    if (!canSeePanel()) {
      trigger.style.display = "none";
      panel.style.display = "none";
      return;
    }

    trigger.style.display = "flex";
    panel.style.display = state.open ? "block" : "none";
  }

  function render() {
    ensurePanel();
    renderShell();

    const count = $("csvbAiUsageLogCount");
    const body = $("csvbAiUsageLogBody");
    const filterEl = $("csvbAiUsageViewerFilter");
    const rows = filteredRows();

    if (filterEl && filterEl.value !== state.viewerFilter) filterEl.value = state.viewerFilter;
    if (count) count.textContent = `Rows: ${rows.length}/${state.rows.length}`;
    if (!body || !canSeePanel()) return;

    if (!state.rows.length) {
      body.innerHTML = `<div style="padding:9px;" class="csvb-ai-usage-muted">No AI usage entries loaded.</div>`;
      return;
    }

    if (!rows.length) {
      body.innerHTML = `<div style="padding:9px;" class="csvb-ai-usage-muted">No rows match the selected viewer filter.</div>`;
      return;
    }

    body.innerHTML = `
      <table class="csvb-ai-usage-table">
        <thead>
          <tr>
            <th>Date/time</th>
            <th>Viewer</th>
            <th>User</th>
            <th>Company</th>
            <th>Role</th>
            <th>Query</th>
            <th>Sources</th>
            <th>Model</th>
            <th>Status</th>
            <th>Response</th>
            <th>Duration</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(rowHtml).join("")}
        </tbody>
      </table>
    `;
  }

  function rowHtml(row) {
    const ok = row.success === true;
    const status = ok ? "Success" : "Failed";
    const statusClass = ok ? "csvb-ai-usage-status-ok" : "csvb-ai-usage-status-fail";
    const responseChars = Number(row.response_chars || 0);
    const error = safeStr(row.error_message || "");
    const type = viewerType(row);

    return `
      <tr>
        <td>${esc(fmtDate(row.created_at))}</td>
        <td><span class="csvb-ai-usage-viewer-pill ${viewerPillClass(type)}">${esc(viewerTypeLabel(type))}</span></td>
        <td>${esc(row.username || row.user_id || "—")}</td>
        <td>${esc(row.company_name || row.company_id || "—")}</td>
        <td>${esc(row.user_role || "—")}</td>
        <td class="csvb-ai-usage-query">${esc(row.query_text || "—")}</td>
        <td>${esc(row.source_question_count ?? "—")}</td>
        <td>${esc(row.model || "—")}</td>
        <td><span class="${statusClass}">${status}</span>${error ? `<div class="csvb-ai-usage-muted">${esc(error)}</div>` : ""}</td>
        <td>${responseChars ? `${responseChars} chars` : "—"}</td>
        <td>${esc(fmtMs(row.duration_ms))}</td>
      </tr>
    `;
  }

  async function loadRows(showToast) {
    try {
      if (!state.sb || !canSeePanel()) return;

      const { data, error } = await state.sb.rpc("csvb_sire_viewer_ai_usage_log_for_me", {
        p_limit: 50
      });

      if (error) throw error;
      state.rows = Array.isArray(data) ? data : [];
      render();

      if (showToast) {
        const ok = $("okBox");
        if (ok) {
          ok.textContent = `Viewer AI usage log refreshed. Rows: ${state.rows.length}.`;
          ok.style.display = "block";
          setTimeout(() => {
            if (ok.textContent.includes("Viewer AI usage log refreshed")) ok.style.display = "none";
          }, 2400);
        }
      }
    } catch (error) {
      console.warn("Viewer AI usage log load failed:", error);
      const body = $("csvbAiUsageLogBody");
      if (body) {
        body.innerHTML = `<div style="padding:9px;" class="csvb-ai-usage-status-fail">Could not load Viewer AI usage log: ${esc(error?.message || error)}</div>`;
      }
    }
  }

  async function boot() {
    try {
      injectStyles();
      ensurePanel();

      if (!window.AUTH?.ensureSupabase || !window.AUTH?.getSessionUserProfile) return;

      state.sb = window.AUTH.ensureSupabase();
      state.me = await window.AUTH.getSessionUserProfile();

      window.CSVB_SIRE_VIEWER_AI_USAGE_LOG = {
        build: BUILD,
        open: () => setOpen(true),
        close: () => setOpen(false),
        reload: loadRows,
        getRows: () => state.rows.slice()
      };

      window.CSVB_VIEWER_AI_USAGE_LOG = window.CSVB_SIRE_VIEWER_AI_USAGE_LOG;

      render();
    } catch (error) {
      console.warn("Viewer AI usage log panel boot failed:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 1200));
  } else {
    setTimeout(boot, 1200);
  }
})();
