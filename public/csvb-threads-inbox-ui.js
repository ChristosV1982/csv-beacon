// public/csvb-threads-inbox-ui.js
// C.S.V. BEACON — T-12B Threads Action Inbox UI.
// Separate extension. Uses csvb_thread_inbox_for_me().

(() => {
  "use strict";

  const BUILD = "T12B-THREADS-INBOX-UI-2026-05-05";

  let sb = null;
  let lastCompanyId = null;
  let busy = false;

  function el(id) {
    return document.getElementById(id);
  }

  function esc(v) {
    return String(v ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function activeCompanyId() {
    return el("platformCompanySelect")?.value || null;
  }

  async function rpc(name, args = {}) {
    const { data, error } = await sb.rpc(name, args);
    if (error) throw error;
    return data || [];
  }

  function ensureInboxCard() {
    let card = el("csvbThreadInboxCard");
    if (card) return card;

    card = document.createElement("section");
    card.id = "csvbThreadInboxCard";
    card.className = "card";
    card.innerHTML = `
      <div class="section-head">
        <h2>Action Inbox</h2>
        <button class="secondary" id="csvbThreadInboxRefreshBtn" type="button">Refresh inbox</button>
      </div>

      <div class="compact-note">
        Operational summary of current thread workload for the selected company / current user.
      </div>

      <div class="thread-inbox-grid" id="csvbThreadInboxGrid">
        <div class="thread-inbox-tile"><div class="n">—</div><div class="t">Open</div></div>
        <div class="thread-inbox-tile"><div class="n">—</div><div class="t">Assigned to me</div></div>
        <div class="thread-inbox-tile"><div class="n">—</div><div class="t">Unread alerts</div></div>
        <div class="thread-inbox-tile"><div class="n">—</div><div class="t">Overdue</div></div>
      </div>

      <div class="thread-inbox-actions">
        <button class="secondary" type="button" data-thread-status-filter="">All</button>
        <button class="secondary" type="button" data-thread-status-filter="open">Open</button>
        <button class="secondary" type="button" data-thread-status-filter="in_progress">In progress</button>
        <button class="secondary" type="button" data-thread-status-filter="awaiting_vessel_reply">Awaiting vessel</button>
        <button class="secondary" type="button" data-thread-status-filter="awaiting_office_review">Awaiting office</button>
        <button class="secondary" type="button" id="csvbThreadShowAlertsBtn">Show alerts</button>
      </div>

      <div id="csvbThreadInboxStatus" class="compact-note"></div>
    `;

    const platformCard = el("platformCompanyCard");
    if (platformCard) {
      platformCard.insertAdjacentElement("afterend", card);
    } else {
      const hero = document.querySelector(".hero");
      hero?.insertAdjacentElement("afterend", card);
    }

    el("csvbThreadInboxRefreshBtn")?.addEventListener("click", loadInbox);

    card.querySelectorAll("[data-thread-status-filter]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const status = btn.getAttribute("data-thread-status-filter") || "";
        const statusFilter = el("statusFilter");
        if (statusFilter) statusFilter.value = status;

        if (typeof window.CSVB_THREADS_RELOAD === "function") {
          await window.CSVB_THREADS_RELOAD();
        } else {
          el("applyFilterBtn")?.click();
        }
      });
    });

    el("csvbThreadShowAlertsBtn")?.addEventListener("click", () => {
      el("notificationsBtn")?.click();
    });

    return card;
  }

  function setInboxStatus(text, kind = "") {
    const s = el("csvbThreadInboxStatus");
    if (!s) return;
    s.className = "compact-note " + kind;
    s.textContent = text || "";
  }

  function renderInbox(row) {
    const grid = el("csvbThreadInboxGrid");
    if (!grid) return;

    const data = row || {};

    grid.innerHTML = `
      <div class="thread-inbox-tile">
        <div class="n">${esc(data.open_count ?? 0)}</div>
        <div class="t">Open</div>
      </div>

      <div class="thread-inbox-tile">
        <div class="n">${esc(data.assigned_to_me_count ?? 0)}</div>
        <div class="t">Assigned to me</div>
      </div>

      <div class="thread-inbox-tile">
        <div class="n">${esc(data.unread_alert_count ?? 0)}</div>
        <div class="t">Unread alerts</div>
      </div>

      <div class="thread-inbox-tile ${Number(data.overdue_count || 0) > 0 ? "warn" : ""}">
        <div class="n">${esc(data.overdue_count ?? 0)}</div>
        <div class="t">Overdue</div>
      </div>

      <div class="thread-inbox-tile">
        <div class="n">${esc(data.in_progress_count ?? 0)}</div>
        <div class="t">In progress</div>
      </div>

      <div class="thread-inbox-tile">
        <div class="n">${esc(data.awaiting_vessel_reply_count ?? 0)}</div>
        <div class="t">Awaiting vessel</div>
      </div>

      <div class="thread-inbox-tile">
        <div class="n">${esc(data.awaiting_office_review_count ?? 0)}</div>
        <div class="t">Awaiting office</div>
      </div>

      <div class="thread-inbox-tile">
        <div class="n">${esc(data.accessible_thread_count ?? 0)}</div>
        <div class="t">Total visible</div>
      </div>
    `;
  }

  async function loadInbox() {
    ensureInboxCard();

    if (busy) return;
    busy = true;
    setInboxStatus("Loading action inbox…");

    try {
      const rows = await rpc("csvb_thread_inbox_for_me", {
        p_company_id: activeCompanyId()
      });

      renderInbox(Array.isArray(rows) ? rows[0] : rows);
      setInboxStatus("Inbox loaded.", "ok");
    } catch (e) {
      setInboxStatus("Inbox load failed:\n" + String(e?.message || e), "err");
    } finally {
      busy = false;
    }
  }

  function hookReload() {
    const original = window.CSVB_THREADS_RELOAD;

    if (typeof original !== "function" || original.__inboxHooked) return;

    const wrapped = async function() {
      const result = await original();
      setTimeout(loadInbox, 250);
      return result;
    };

    wrapped.__inboxHooked = true;
    window.CSVB_THREADS_RELOAD = wrapped;
  }

  function watchCompany() {
    setInterval(() => {
      hookReload();

      const cid = activeCompanyId();
      if (cid === lastCompanyId) return;

      lastCompanyId = cid;
      setTimeout(loadInbox, 250);
    }, 900);
  }

  function init() {
    window.CSVB_THREADS_INBOX_UI_BUILD = BUILD;

    if (!window.AUTH?.ensureSupabase) return;

    sb = window.AUTH.ensureSupabase();

    ensureInboxCard();
    watchCompany();
    setTimeout(loadInbox, 1200);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
