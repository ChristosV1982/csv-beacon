// public/csvb-dashboard-threads-badge.js
// C.S.V. BEACON — T-12C Dashboard Threads Badge.
// Shows unread / assigned / overdue counts on the Threads dashboard card.

(() => {
  "use strict";

  const BUILD = "T12C-DASHBOARD-THREADS-BADGE-2026-05-05";
  const CSVB_COMPANY_VIEW_ID_KEY = "csvb_superuser_company_view_id";

  function isPlatformRole(role) {
    return role === "super_admin" || role === "platform_owner";
  }

  function injectStyles() {
    if (document.getElementById("csvbDashboardThreadsBadgeStyles")) return;

    const style = document.createElement("style");
    style.id = "csvbDashboardThreadsBadgeStyles";
    style.textContent = `
      .csvb-thread-dashboard-badge {
        margin-top: 8px;
        display: flex;
        align-items: center;
        gap: 6px;
        flex-wrap: wrap;
      }

      .csvb-thread-dashboard-pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border: 1px solid #AEE3F1;
        background: #E9F7FB;
        color: #062A5E;
        border-radius: 999px;
        padding: 4px 8px;
        font-size: .82rem;
        font-weight: 500;
        white-space: nowrap;
      }

      .csvb-thread-dashboard-pill.warn {
        border-color: #F6D58F;
        background: #FFF6E0;
        color: #8A5A00;
      }

      .csvb-thread-dashboard-pill.danger {
        border-color: #F2B7B7;
        background: #FFEAEA;
        color: #9B1C1C;
      }

      .csvb-thread-dashboard-pill.muted {
        border-color: #D6E4F5;
        background: #F7FAFE;
        color: #5E6F86;
      }
    `;

    document.head.appendChild(style);
  }

  function card() {
    return document.querySelector('[data-card="threads"]');
  }

  function setBadgeHtml(html) {
    const c = card();
    if (!c) return;

    injectStyles();

    let box = c.querySelector("#csvbThreadsDashboardBadge");
    if (!box) {
      box = document.createElement("div");
      box.id = "csvbThreadsDashboardBadge";
      box.className = "csvb-thread-dashboard-badge";

      const muted = c.querySelector(".muted");
      if (muted) {
        muted.insertAdjacentElement("afterend", box);
      } else {
        c.appendChild(box);
      }
    }

    box.innerHTML = html;
  }

  function currentCompanyForPlatform(role) {
    if (!isPlatformRole(role)) return null;

    const simulated = localStorage.getItem(CSVB_COMPANY_VIEW_ID_KEY);
    return simulated || null;
  }

  async function loadBadge() {
    window.CSVB_DASHBOARD_THREADS_BADGE_BUILD = BUILD;

    const c = card();
    if (!c) return;

    setBadgeHtml(`<span class="csvb-thread-dashboard-pill muted">Loading threads…</span>`);

    try {
      if (!window.AUTH?.ensureSupabase) {
        setBadgeHtml(`<span class="csvb-thread-dashboard-pill muted">Threads unavailable</span>`);
        return;
      }

      const sb = window.AUTH.ensureSupabase();

      let bundle = null;
      if (window.AUTH.getSessionUserProfile) {
        bundle = await window.AUTH.getSessionUserProfile();
      }

      const role = bundle?.profile?.role || "";
      const companyId = currentCompanyForPlatform(role);

      const { data, error } = await sb.rpc("csvb_thread_inbox_for_me", {
        p_company_id: companyId
      });

      if (error) throw error;

      const row = Array.isArray(data) ? data[0] : data;
      const unread = Number(row?.unread_alert_count || 0);
      const assigned = Number(row?.assigned_to_me_count || 0);
      const overdue = Number(row?.overdue_count || 0);
      const open = Number(row?.open_count || 0);

      setBadgeHtml(`
        <span class="csvb-thread-dashboard-pill ${unread > 0 ? "warn" : "muted"}">Unread: ${unread}</span>
        <span class="csvb-thread-dashboard-pill ${assigned > 0 ? "warn" : "muted"}">Assigned: ${assigned}</span>
        <span class="csvb-thread-dashboard-pill ${overdue > 0 ? "danger" : "muted"}">Overdue: ${overdue}</span>
        <span class="csvb-thread-dashboard-pill muted">Open: ${open}</span>
      `);
    } catch (e) {
      setBadgeHtml(`<span class="csvb-thread-dashboard-pill danger">Thread badge error</span>`);
      console.warn("C.S.V. BEACON Threads dashboard badge error:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      setTimeout(loadBadge, 900);
      setTimeout(loadBadge, 2200);
    });
  } else {
    setTimeout(loadBadge, 900);
    setTimeout(loadBadge, 2200);
  }
})();
