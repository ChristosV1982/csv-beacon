// public/q-sire-questions-viewer-change-log.js
// C.S.V. BEACON — SIRE 2.0 Questions Viewer superuser change log
// Viewer-only helper. Read-only. No SIRE data writes.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-CHANGE-LOG-20260517_3";
  const LS_OPEN = "csvb_sire_viewer_change_log_open";

  window.CSVB_SIRE_VIEWER_CHANGE_LOG_BUILD = BUILD;

  const state = {
    sb: null,
    me: null,
    events: [],
    recipientsByEvent: new Map(),
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
    // Default is collapsed because this is a monitoring log, not an operational alert.
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
    if ($("csvbSireViewerChangeLogStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSireViewerChangeLogStyles";
    style.textContent = `
      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-trigger {
        width: 100%;
        margin: 5px auto 6px;
        display: none;
        align-items: center;
        justify-content: flex-start;
        gap: 7px;
        flex-wrap: wrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-trigger .btn {
        padding: 6px 10px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-panel {
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

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-title {
        color: #062A5E;
        font-weight: 850;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-subtitle {
        color: #5E6F86;
        font-size: 12px;
        margin-top: 2px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-actions {
        display: inline-flex;
        gap: 7px;
        align-items: center;
        flex-wrap: wrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-list {
        margin-top: 9px;
        display: grid;
        gap: 8px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-item {
        border: 1px solid #D6E4F5;
        background: #FFFFFF;
        border-radius: 10px;
        padding: 8px 9px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-item-top {
        display: grid;
        grid-template-columns: minmax(0, 1fr) auto;
        gap: 10px;
        align-items: start;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-event-title {
        color: #062A5E;
        font-weight: 850;
        line-height: 1.25;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-meta {
        color: #5E6F86;
        font-size: 12px;
        margin-top: 4px;
        line-height: 1.35;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-summary {
        color: #10233F;
        margin-top: 6px;
        line-height: 1.35;
        white-space: pre-wrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-counts {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        margin-top: 7px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-pill {
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

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-recipients {
        display: none;
        margin-top: 8px;
        border-top: 1px solid #D6E4F5;
        padding-top: 8px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-recipient-row {
        display: grid;
        grid-template-columns: minmax(160px, 1fr) minmax(110px, .8fr) minmax(160px, 1fr) 80px;
        gap: 8px;
        align-items: start;
        border: 1px solid #E1EAF7;
        border-radius: 8px;
        padding: 6px 8px;
        margin-top: 5px;
        font-size: 12px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-muted {
        color: #5E6F86;
      }

      @media (max-width: 900px) {
        html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-item-top {
          grid-template-columns: 1fr;
        }

        html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-change-log-recipient-row {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);
  }

  function insertionAnchor() {
    return $("csvbSireViewerAlertsPanel") || document.querySelector(".csvb-sire-viewer-helper");
  }

  function ensurePanel() {
    if ($("csvbSireViewerChangeLogPanel")) return;

    const anchor = insertionAnchor();

    const trigger = document.createElement("div");
    trigger.id = "csvbSireViewerChangeLogTrigger";
    trigger.className = "csvb-sire-change-log-trigger";
    trigger.innerHTML = `
      <button id="csvbSireViewerChangeLogToggleBtn" class="btn light" type="button">Changes Log</button>
    `;

    const panel = document.createElement("div");
    panel.id = "csvbSireViewerChangeLogPanel";
    panel.className = "csvb-sire-change-log-panel";
    panel.innerHTML = `
      <div class="csvb-sire-change-log-head">
        <div>
          <div class="csvb-sire-change-log-title">SIRE Library Change Log</div>
          <div class="csvb-sire-change-log-subtitle">Platform monitoring log for SIRE 2.0 Questions Viewer content-change events.</div>
        </div>
        <div class="csvb-sire-change-log-actions">
          <span class="csvb-sire-change-log-pill" id="csvbSireViewerChangeLogCount">Events: 0</span>
          <button id="csvbSireViewerChangeLogRefreshBtn" class="btn light" type="button">Refresh log</button>
          <button id="csvbSireViewerChangeLogCloseBtn" class="btn light" type="button">Close log</button>
        </div>
      </div>
      <div class="csvb-sire-change-log-list" id="csvbSireViewerChangeLogList"></div>
    `;

    if (anchor) {
      anchor.insertAdjacentElement("afterend", panel);
      anchor.insertAdjacentElement("afterend", trigger);
    } else {
      document.body.prepend(panel);
      document.body.prepend(trigger);
    }

    $("csvbSireViewerChangeLogToggleBtn")?.addEventListener("click", () => setOpen(!state.isOpen));
    $("csvbSireViewerChangeLogCloseBtn")?.addEventListener("click", () => setOpen(false));
    $("csvbSireViewerChangeLogRefreshBtn")?.addEventListener("click", () => loadLog(true));
  }

  function setOpen(value) {
    state.isOpen = !!value;
    saveOpenState(state.isOpen);
    renderLog();
  }

  function updateTriggerAndPanelShell() {
    const trigger = $("csvbSireViewerChangeLogTrigger");
    const panel = $("csvbSireViewerChangeLogPanel");
    const count = $("csvbSireViewerChangeLogCount");
    const toggleBtn = $("csvbSireViewerChangeLogToggleBtn");

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

    const list = $("csvbSireViewerChangeLogList");
    if (!list || !isPlatformRole()) return;

    const rows = state.events || [];

    if (!rows.length) {
      list.innerHTML = `<div class="csvb-sire-change-log-muted">No SIRE library change events recorded yet.</div>`;
      return;
    }

    list.innerHTML = rows.map((e) => {
      const eventId = safeStr(e.event_id || "");
      const qno = safeStr(e.question_no || "");
      const changedBy = safeStr(e.created_by_username || e.created_by || "—");
      const adminTotal = Number(e.admin_notifications_total || 0);
      const adminUnread = Number(e.admin_notifications_unread || 0);
      const adminCompanies = Number(e.admin_companies_notified || 0);
      const broadcastTotal = Number(e.company_broadcast_notifications_total || 0);
      const broadcastUnread = Number(e.company_broadcast_notifications_unread || 0);
      const broadcastCompanies = Number(e.company_broadcast_companies || 0);

      return `
        <div class="csvb-sire-change-log-item" data-sire-event-id="${esc(eventId)}">
          <div class="csvb-sire-change-log-item-top">
            <div>
              <div class="csvb-sire-change-log-event-title">${esc(e.title || "SIRE 2.0 Questions Viewer updated")}</div>
              <div class="csvb-sire-change-log-meta">
                ${esc(fmtDate(e.created_at))}
                ${qno ? " • Q " + esc(qno) : ""}
                ${e.change_scope ? " • Scope: " + esc(e.change_scope) : ""}
                ${e.event_type ? " • Type: " + esc(e.event_type) : ""}
                ${" • Changed by: " + esc(changedBy)}
              </div>
              ${e.summary ? `<div class="csvb-sire-change-log-summary">${esc(e.summary)}</div>` : ""}
              <div class="csvb-sire-change-log-counts">
                <span class="csvb-sire-change-log-pill">Admin alerts: ${adminTotal}</span>
                <span class="csvb-sire-change-log-pill">Admin unread: ${adminUnread}</span>
                <span class="csvb-sire-change-log-pill">Admin companies: ${adminCompanies}</span>
                <span class="csvb-sire-change-log-pill">User broadcasts: ${broadcastTotal}</span>
                <span class="csvb-sire-change-log-pill">Broadcast unread: ${broadcastUnread}</span>
                <span class="csvb-sire-change-log-pill">Broadcast companies: ${broadcastCompanies}</span>
              </div>
            </div>
            <div class="csvb-sire-change-log-actions">
              <button class="btn light" type="button" data-sire-recipients-toggle="${esc(eventId)}">Recipients</button>
            </div>
          </div>
          <div class="csvb-sire-change-log-recipients" id="csvbSireRecipients_${esc(eventId)}"></div>
        </div>
      `;
    }).join("");

    list.querySelectorAll("[data-sire-recipients-toggle]").forEach((btn) => {
      btn.addEventListener("click", () => toggleRecipients(btn.getAttribute("data-sire-recipients-toggle")));
    });
  }

  function renderRecipients(eventId) {
    const host = $("csvbSireRecipients_" + eventId);
    if (!host) return;

    const rows = state.recipientsByEvent.get(eventId) || [];

    if (!rows.length) {
      host.innerHTML = `<div class="csvb-sire-change-log-muted">No notification recipients recorded for this event.</div>`;
      return;
    }

    host.innerHTML = rows.map((r) => `
      <div class="csvb-sire-change-log-recipient-row">
        <div>
          <strong>${esc(r.username || r.user_id || "—")}</strong>
          <div class="csvb-sire-change-log-muted">${esc(r.user_role || "")}</div>
        </div>
        <div>
          ${esc(r.sire_alert_type || "")}
          <div class="csvb-sire-change-log-muted">${esc(r.recipient_scope || "")}</div>
        </div>
        <div>
          ${esc(r.company_name || r.company_id || "—")}
          <div class="csvb-sire-change-log-muted">${esc(fmtDate(r.created_at))}</div>
        </div>
        <div>${r.is_read ? "Read" : "Unread"}</div>
      </div>
    `).join("");
  }

  async function toggleRecipients(eventId) {
    if (!eventId) return;

    const host = $("csvbSireRecipients_" + eventId);
    if (!host) return;

    if (host.style.display === "block") {
      host.style.display = "none";
      return;
    }

    host.style.display = "block";
    host.innerHTML = `<div class="csvb-sire-change-log-muted">Loading recipients…</div>`;

    try {
      if (!state.recipientsByEvent.has(eventId)) {
        const { data, error } = await state.sb.rpc("csvb_sire_library_change_event_notifications_for_me", {
          p_event_id: eventId
        });

        if (error) throw error;
        state.recipientsByEvent.set(eventId, Array.isArray(data) ? data : []);
      }

      renderRecipients(eventId);
    } catch (error) {
      host.innerHTML = `<div class="csvb-sire-change-log-muted">Could not load recipients: ${esc(error?.message || error)}</div>`;
    }
  }

  async function loadLog(showToast = false) {
    try {
      if (!state.sb || !isPlatformRole()) return;

      const { data, error } = await state.sb.rpc("csvb_sire_library_change_log_for_me", {
        p_limit: 20
      });

      if (error) throw error;

      state.events = Array.isArray(data) ? data : [];
      state.recipientsByEvent.clear();
      renderLog();

      if (showToast) toastOk(`SIRE library change log refreshed. Events: ${state.events.length}.`);
    } catch (error) {
      console.warn("SIRE library change log load failed:", error);
      renderLog();
      if (showToast) toastWarn("Could not load SIRE library change log: " + safeStr(error?.message || error));
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

      window.CSVB_SIRE_VIEWER_CHANGE_LOG = {
        build: BUILD,
        reload: loadLog,
        open: () => setOpen(true),
        close: () => setOpen(false),
        toggle: () => setOpen(!state.isOpen),
        getEvents: () => (state.events || []).slice(),
        getRecipients: (eventId) => (state.recipientsByEvent.get(eventId) || []).slice()
      };

      if (!isPlatformRole()) {
        renderLog();
        return;
      }

      await loadLog(false);
    } catch (error) {
      console.warn("SIRE library change log boot failed:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 900));
  } else {
    setTimeout(boot, 900);
  }
})();
