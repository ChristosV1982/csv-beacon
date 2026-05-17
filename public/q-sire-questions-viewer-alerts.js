// public/q-sire-questions-viewer-alerts.js
// C.S.V. BEACON — SIRE 2.0 Questions Viewer library-update alerts
// Viewer-only helper. No edits to SIRE question data.

(() => {
  "use strict";

  const BUILD = "SIRE-VIEWER-ALERTS-20260517_1";
  window.CSVB_SIRE_VIEWER_ALERTS_BUILD = BUILD;

  const state = {
    sb: null,
    me: null,
    alerts: []
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

  function isCompanyAdmin() {
    return role() === "company_admin";
  }

  function fmtDate(value) {
    if (!value) return "";
    try {
      return new Date(value).toLocaleString();
    } catch (_) {
      return safeStr(value);
    }
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
      }, 2800);
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
    if ($("csvbSireViewerAlertsStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbSireViewerAlertsStyles";
    style.textContent = `
      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-alerts-panel {
        width: 100%;
        max-width: 100%;
        margin: 8px auto 10px;
        border: 1px solid #F6D58F;
        background: #FFF9EA;
        border-radius: 12px;
        box-shadow: 0 8px 20px rgba(3,27,63,.05);
        padding: 9px 12px;
        display: none;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-alerts-head {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 10px;
        flex-wrap: wrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-alerts-title {
        color: #062A5E;
        font-weight: 800;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-alerts-subtitle {
        color: #5E6F86;
        font-size: 12px;
        margin-top: 2px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-alerts-actions {
        display: inline-flex;
        gap: 7px;
        align-items: center;
        flex-wrap: wrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-alert-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #F6D58F;
        background: #FFF6E0;
        color: #8A5A00;
        border-radius: 999px;
        padding: 5px 9px;
        font-weight: 800;
        font-size: 12px;
        white-space: nowrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-alert-list {
        margin-top: 8px;
        display: grid;
        gap: 7px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-alert-item {
        border: 1px solid #F2D29A;
        background: #FFFFFF;
        border-radius: 10px;
        padding: 8px 9px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-alert-item-top {
        display: flex;
        justify-content: space-between;
        align-items: flex-start;
        gap: 10px;
        flex-wrap: wrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-alert-item-title {
        color: #062A5E;
        font-weight: 800;
        line-height: 1.25;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-alert-item-body {
        color: #10233F;
        margin-top: 5px;
        line-height: 1.35;
        white-space: pre-wrap;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-alert-meta {
        color: #5E6F86;
        font-size: 12px;
        margin-top: 5px;
      }

      html[data-csvb-page="q-sire-questions-viewer.html"] .csvb-sire-alert-item-actions {
        display: inline-flex;
        gap: 7px;
        align-items: center;
        flex-wrap: wrap;
      }
    `;
    document.head.appendChild(style);
  }

  function ensurePanel() {
    if ($("csvbSireViewerAlertsPanel")) return;

    const helper = document.querySelector(".csvb-sire-viewer-helper");
    const host = helper?.parentElement || document.body;
    const panel = document.createElement("div");
    panel.id = "csvbSireViewerAlertsPanel";
    panel.className = "csvb-sire-alerts-panel";
    panel.innerHTML = `
      <div class="csvb-sire-alerts-head">
        <div>
          <div class="csvb-sire-alerts-title">SIRE 2.0 Questions Viewer update alerts</div>
          <div class="csvb-sire-alerts-subtitle" id="csvbSireViewerAlertsSubtitle">No unread alerts.</div>
        </div>
        <div class="csvb-sire-alerts-actions">
          <span class="csvb-sire-alert-pill" id="csvbSireViewerAlertsCount">Unread: 0</span>
          <button id="csvbSireViewerAlertsRefreshBtn" class="btn light" type="button">Refresh alerts</button>
          <button id="csvbSireViewerAlertsMarkReadBtn" class="btn light" type="button">Mark all read</button>
        </div>
      </div>
      <div class="csvb-sire-alert-list" id="csvbSireViewerAlertsList"></div>
    `;

    if (helper) helper.insertAdjacentElement("afterend", panel);
    else host.prepend(panel);

    $("csvbSireViewerAlertsRefreshBtn")?.addEventListener("click", () => loadAlerts(true));
    $("csvbSireViewerAlertsMarkReadBtn")?.addEventListener("click", markAllRead);
  }

  function renderAlerts() {
    ensurePanel();

    const panel = $("csvbSireViewerAlertsPanel");
    const count = $("csvbSireViewerAlertsCount");
    const subtitle = $("csvbSireViewerAlertsSubtitle");
    const list = $("csvbSireViewerAlertsList");

    if (!panel || !count || !subtitle || !list) return;

    const unread = state.alerts || [];
    count.textContent = `Unread: ${unread.length}`;

    if (!unread.length) {
      panel.style.display = "none";
      list.innerHTML = "";
      subtitle.textContent = "No unread SIRE Viewer update alerts.";
      return;
    }

    panel.style.display = "block";
    subtitle.textContent = isCompanyAdmin()
      ? "Review SIRE Viewer updates and optionally notify all users in your company."
      : "Review SIRE Viewer updates.";

    list.innerHTML = unread.map((a) => {
      const eventId = safeStr(a.event_id || "");
      const nid = safeStr(a.notification_id || "");
      const qno = safeStr(a.question_no || "");
      const scope = safeStr(a.change_scope || "library");
      const type = safeStr(a.event_type || "");
      const canBroadcast = isCompanyAdmin() && type === "sire_library_update_admin_alert" && eventId;

      return `
        <div class="csvb-sire-alert-item" data-notification-id="${esc(nid)}" data-event-id="${esc(eventId)}">
          <div class="csvb-sire-alert-item-top">
            <div>
              <div class="csvb-sire-alert-item-title">${esc(a.title || "SIRE 2.0 Questions Viewer updated")}</div>
              <div class="csvb-sire-alert-meta">
                ${esc(fmtDate(a.created_at))}
                ${qno ? " • Q " + esc(qno) : ""}
                ${scope ? " • Scope: " + esc(scope) : ""}
              </div>
            </div>
            <div class="csvb-sire-alert-item-actions">
              ${canBroadcast ? `<button class="btn light" type="button" data-csvb-broadcast-event="${esc(eventId)}" data-csvb-notification-id="${esc(nid)}">Notify company users</button>` : ""}
              <button class="btn light" type="button" data-csvb-mark-one-read="${esc(nid)}">Mark read</button>
            </div>
          </div>
          <div class="csvb-sire-alert-item-body">${esc(a.body || a.event_summary || "The SIRE 2.0 Questions Viewer content has been updated.")}</div>
        </div>
      `;
    }).join("");

    list.querySelectorAll("[data-csvb-mark-one-read]").forEach((btn) => {
      btn.addEventListener("click", () => markRead([btn.getAttribute("data-csvb-mark-one-read")].filter(Boolean)));
    });

    list.querySelectorAll("[data-csvb-broadcast-event]").forEach((btn) => {
      btn.addEventListener("click", () => broadcastToCompanyUsers(
        btn.getAttribute("data-csvb-broadcast-event"),
        btn.getAttribute("data-csvb-notification-id")
      ));
    });
  }

  async function loadAlerts(showToast = false) {
    try {
      if (!state.sb || !state.me) return;

      const { data, error } = await state.sb.rpc("csvb_sire_library_update_alerts_for_me", {
        p_only_unread: true
      });

      if (error) throw error;

      state.alerts = Array.isArray(data) ? data : [];
      renderAlerts();

      if (showToast) toastOk(`SIRE Viewer alerts refreshed. Unread: ${state.alerts.length}`);
    } catch (error) {
      console.warn("SIRE Viewer alert load failed:", error);
      if (showToast) toastWarn("Could not load SIRE Viewer alerts: " + safeStr(error?.message || error));
    }
  }

  async function markRead(notificationIds) {
    const ids = (notificationIds || []).filter(Boolean);
    if (!ids.length) return;

    try {
      const { error } = await state.sb.rpc("csvb_mark_thread_notifications_read", {
        p_notification_ids: ids
      });

      if (error) throw error;
      await loadAlerts(false);
      toastOk("Alert marked as read.");
    } catch (error) {
      toastWarn("Could not mark alert read: " + safeStr(error?.message || error));
    }
  }

  async function markAllRead() {
    const ids = (state.alerts || []).map((a) => a.notification_id).filter(Boolean);
    if (!ids.length) return;
    await markRead(ids);
  }

  async function broadcastToCompanyUsers(eventId, notificationId) {
    if (!eventId) return;

    const okConfirm = window.confirm(
      "Notify all active company users about this SIRE 2.0 Questions Viewer update?"
    );
    if (!okConfirm) return;

    try {
      const { data, error } = await state.sb.rpc("csvb_sire_company_notify_library_update", {
        p_event_id: eventId,
        p_company_id: null,
        p_body: null
      });

      if (error) throw error;

      if (notificationId) {
        await state.sb.rpc("csvb_mark_thread_notifications_read", {
          p_notification_ids: [notificationId]
        });
      }

      const row = Array.isArray(data) ? data[0] : data;
      const count = Number(row?.notifications_created || 0);
      await loadAlerts(false);
      toastOk(`Company users notified. Notifications created: ${count}.`);
    } catch (error) {
      toastWarn("Could not notify company users: " + safeStr(error?.message || error));
    }
  }

  async function boot() {
    try {
      injectStyles();
      ensurePanel();

      if (!window.AUTH?.ensureSupabase || !window.AUTH?.getSessionUserProfile) return;

      state.sb = window.AUTH.ensureSupabase();
      state.me = await window.AUTH.getSessionUserProfile();

      if (!state.me?.session?.user) return;

      await loadAlerts(false);
      window.CSVB_SIRE_VIEWER_ALERTS = {
        build: BUILD,
        reload: loadAlerts,
        getAlerts: () => (state.alerts || []).slice()
      };
    } catch (error) {
      console.warn("SIRE Viewer alerts boot failed:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => setTimeout(boot, 700));
  } else {
    setTimeout(boot, 700);
  }
})();
