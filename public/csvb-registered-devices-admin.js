// public/csvb-registered-devices-admin.js
// C.S.V. BEACON — Registered Devices Admin Panel
// D1 frontend foundation.
// Adds a Superuser Administration tab for pending/approved/blocked/revoked devices.
// No global device gate yet. No offline sync activation.

(() => {
  "use strict";

  const BUILD = "REGISTERED-DEVICES-ADMIN-20260527-FILTERS-1";
  const TAB_KEY = "registered_devices";
  const PANEL_ID = "tab-registered-devices";
  const TABS = ["companies", "users", "vessels", "rights", TAB_KEY];

  const state = {
    devices: [],
    companies: [],
    filters: {
      status: "",
      company_id: "",
      offline: "",
      device_type: "",
      last_seen: "",
      search: ""
    }
  };

  function esc(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function shortId(value) {
    const s = String(value || "");
    if (s.length <= 18) return s;
    return s.slice(0, 8) + "…" + s.slice(-8);
  }

  function sb() {
    if (!window.AUTH?.ensureSupabase) throw new Error("AUTH helper is not loaded.");
    return window.AUTH.ensureSupabase();
  }

  function showWarnLocal(message) {
    if (typeof window.showWarn === "function") return window.showWarn(message);
    const w = document.getElementById("warnBox");
    if (w) {
      w.textContent = message || "";
      w.style.display = message ? "block" : "none";
    } else {
      alert(message);
    }
  }

  function showOkLocal(message) {
    if (typeof window.showOk === "function") return window.showOk(message);
    const ok = document.getElementById("okBox");
    if (ok) {
      ok.textContent = message || "";
      ok.style.display = message ? "block" : "none";
    }
  }

  function companyLabel(companyId) {
    if (!companyId) return "Platform / none";
    const c = state.companies.find((x) => String(x.id) === String(companyId));
    return c?.company_name || c?.short_name || c?.company_code || companyId;
  }

  function statusClass(status) {
    const s = String(status || "").toLowerCase();
    if (s === "approved") return "csvb-dev-approved";
    if (s === "pending") return "csvb-dev-pending";
    if (s === "blocked") return "csvb-dev-blocked";
    if (s === "revoked") return "csvb-dev-revoked";
    return "";
  }

  function ensureStyles() {
    if (document.getElementById("csvbRegisteredDevicesAdminStyles")) return;
    const style = document.createElement("style");
    style.id = "csvbRegisteredDevicesAdminStyles";
    style.textContent = `
      #${PANEL_ID} .csvb-dev-toolbar {
        display:flex;
        align-items:flex-end;
        gap:10px;
        flex-wrap:wrap;
        margin:12px 0;
      }
      #${PANEL_ID} .csvb-dev-field {
        display:flex;
        flex-direction:column;
        gap:5px;
        min-width:170px;
      }
      #${PANEL_ID} .csvb-dev-table-wrap {
        overflow:auto;
        border:1px solid #E1ECF7;
        border-radius:12px;
        max-height:620px;
      }
      #${PANEL_ID} table { min-width:1450px; }
      #${PANEL_ID} .csvb-dev-pill {
        display:inline-flex;
        align-items:center;
        padding:4px 9px;
        border-radius:999px;
        font-weight:950;
        font-size:.82rem;
        border:1px solid #D6E4F5;
        background:#F7FAFE;
        color:#062A5E;
      }
      #${PANEL_ID} .csvb-dev-approved { background:#EAF9EF; border-color:#B8E7C8; color:#087334; }
      #${PANEL_ID} .csvb-dev-pending { background:#FFF6E0; border-color:#F6D58F; color:#8A5A00; }
      #${PANEL_ID} .csvb-dev-blocked,
      #${PANEL_ID} .csvb-dev-revoked { background:#FFEAEA; border-color:#F2B7B7; color:#9B1C1C; }
      #${PANEL_ID} .csvb-dev-actions {
        display:flex;
        gap:6px;
        flex-wrap:wrap;
      }
      #${PANEL_ID} .csvb-dev-actions button {
        padding:7px 9px;
        border-radius:9px;
        font-size:.82rem;
        font-weight:900;
      }
      #${PANEL_ID} .csvb-dev-small {
        font-size:.82rem;
        color:#5E6F86;
        font-weight:750;
        line-height:1.3;
      }
      #${PANEL_ID} .csvb-dev-id {
        font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;
        font-size:.78rem;
        font-weight:850;
      }
      #${PANEL_ID} .csvb-dev-summary {
        display:grid;
        grid-template-columns:repeat(auto-fit,minmax(140px,1fr));
        gap:8px;
        margin:10px 0;
      }
      #${PANEL_ID} .csvb-dev-summary-box {
        border:1px solid #D6E4F5;
        background:#F7FAFE;
        border-radius:12px;
        padding:9px 10px;
      }
      #${PANEL_ID} .csvb-dev-summary-box .n {
        color:#062A5E;
        font-weight:950;
        font-size:1.16rem;
      }
      #${PANEL_ID} .csvb-dev-summary-box .t {
        color:#5E6F86;
        font-weight:800;
        font-size:.8rem;
      }
    `;
    document.head.appendChild(style);
  }

  function ensureTab() {
    const tabs = document.querySelector(".tabs");
    if (!tabs || document.querySelector('[data-tab="' + TAB_KEY + '"]')) return;

    const btn = document.createElement("button");
    btn.className = "tab";
    btn.type = "button";
    btn.dataset.tab = TAB_KEY;
    btn.textContent = "Registered Devices";
    btn.addEventListener("click", () => activateTab());
    tabs.appendChild(btn);
  }

  function ensurePanel() {
    let panel = document.getElementById(PANEL_ID);
    if (panel) return panel;

    panel = document.createElement("div");
    panel.className = "card";
    panel.id = PANEL_ID;
    panel.style.display = "none";
    panel.innerHTML = `
      <div style="font-weight:950;font-size:1.05rem;">Registered Devices</div>
      <div class="muted" style="margin-top:6px;">
        Approve, block or revoke devices allowed to access C.S.V. BEACON. Offline permission is controlled separately and remains disabled unless explicitly allowed.
      </div>

      <div class="csvb-dev-toolbar">
        <div class="csvb-dev-field">
          <label>Status</label>
          <select id="rdStatusFilter">
            <option value="">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="blocked">Blocked</option>
            <option value="revoked">Revoked</option>
          </select>
        </div>
        <div class="csvb-dev-field">
          <label>Company</label>
          <select id="rdCompanyFilter">
            <option value="">All / own company</option>
          </select>
        </div>
        <div class="csvb-dev-field">
          <label>Offline</label>
          <select id="rdOfflineFilter">
            <option value="">All offline permissions</option>
            <option value="yes">Offline allowed</option>
            <option value="no">Offline not allowed</option>
          </select>
        </div>
        <div class="csvb-dev-field">
          <label>Device Type</label>
          <select id="rdDeviceTypeFilter">
            <option value="">All types</option>
            <option value="desktop">Desktop</option>
            <option value="laptop">Laptop</option>
            <option value="tablet">Tablet</option>
            <option value="smartphone">Smartphone</option>
            <option value="shared_workstation">Shared workstation</option>
            <option value="unknown">Unknown</option>
          </select>
        </div>
        <div class="csvb-dev-field">
          <label>Last Seen</label>
          <select id="rdLastSeenFilter">
            <option value="">Any time</option>
            <option value="24h">Last 24 hours</option>
            <option value="7d">Last 7 days</option>
            <option value="30d">Last 30 days</option>
            <option value="never">Never seen</option>
          </select>
        </div>
        <div class="csvb-dev-field" style="min-width:260px;">
          <label>Search</label>
          <input id="rdSearchInput" type="text" placeholder="Device / ID / user / platform..." />
        </div>
        <div class="actions">
          <button class="btn" type="button" id="rdRefreshBtn">Refresh</button>
          <button class="btn2" type="button" id="rdResetFiltersBtn">Reset filters</button>
        </div>
      </div>

      <div class="csvb-dev-summary" id="rdSummary"></div>

      <div class="csvb-dev-table-wrap">
        <table>
          <thead>
            <tr>
              <th>Status</th>
              <th>Device</th>
              <th>Type / Platform</th>
              <th>Company / Vessel</th>
              <th>Requested By</th>
              <th>Approved By</th>
              <th>Last User</th>
              <th>Offline</th>
              <th>Dates</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody id="rdTbody">
            <tr><td colspan="10" class="muted small">No data loaded.</td></tr>
          </tbody>
        </table>
      </div>
    `;

    const wrap = document.querySelector(".wrap");
    if (wrap) wrap.appendChild(panel);
    else document.body.appendChild(panel);

    document.getElementById("rdRefreshBtn")?.addEventListener("click", loadDevices);
    document.getElementById("rdStatusFilter")?.addEventListener("change", () => {
      state.filters.status = document.getElementById("rdStatusFilter")?.value || "";
      loadDevices();
    });
    document.getElementById("rdCompanyFilter")?.addEventListener("change", () => {
      state.filters.company_id = document.getElementById("rdCompanyFilter")?.value || "";
      loadDevices();
    });

    document.getElementById("rdOfflineFilter")?.addEventListener("change", () => {
      state.filters.offline = document.getElementById("rdOfflineFilter")?.value || "";
      renderSummary();
      renderTable();
    });

    document.getElementById("rdDeviceTypeFilter")?.addEventListener("change", () => {
      state.filters.device_type = document.getElementById("rdDeviceTypeFilter")?.value || "";
      renderSummary();
      renderTable();
    });

    document.getElementById("rdLastSeenFilter")?.addEventListener("change", () => {
      state.filters.last_seen = document.getElementById("rdLastSeenFilter")?.value || "";
      renderSummary();
      renderTable();
    });

    document.getElementById("rdSearchInput")?.addEventListener("input", () => {
      state.filters.search = document.getElementById("rdSearchInput")?.value || "";
      renderSummary();
      renderTable();
    });

    document.getElementById("rdResetFiltersBtn")?.addEventListener("click", () => {
      state.filters.status = "";
      state.filters.company_id = "";
      state.filters.offline = "";
      state.filters.device_type = "";
      state.filters.last_seen = "";
      state.filters.search = "";

      const status = document.getElementById("rdStatusFilter");
      const company = document.getElementById("rdCompanyFilter");
      const offline = document.getElementById("rdOfflineFilter");
      const type = document.getElementById("rdDeviceTypeFilter");
      const lastSeen = document.getElementById("rdLastSeenFilter");
      const search = document.getElementById("rdSearchInput");

      if (status) status.value = "";
      if (company) company.value = "";
      if (offline) offline.value = "";
      if (type) type.value = "";
      if (lastSeen) lastSeen.value = "";
      if (search) search.value = "";

      loadDevices();
    });

    return panel;
  }

  function activateTab() {
    document.querySelectorAll(".tab").forEach((b) => b.classList.toggle("active", b.dataset.tab === TAB_KEY));

    for (const key of TABS) {
      const panel = key === TAB_KEY ? document.getElementById(PANEL_ID) : document.getElementById("tab-" + key);
      if (panel) panel.style.display = key === TAB_KEY ? "" : "none";
    }

    loadDevices().catch((e) => showWarnLocal(String(e?.message || e)));
  }

  async function loadCompanies() {
    try {
      const { data, error } = await sb().rpc("csvb_admin_list_companies");
      if (error) throw error;
      state.companies = data || [];
    } catch (_) {
      state.companies = [];
    }

    const sel = document.getElementById("rdCompanyFilter");
    if (!sel) return;

    const current = sel.value;
    sel.innerHTML = '<option value="">All / own company</option>' +
      state.companies.map((c) => {
        const label = c.company_name || c.short_name || c.company_code || c.id;
        return `<option value="${esc(c.id)}">${esc(label)}</option>`;
      }).join("");
    if (current) sel.value = current;
  }

  async function loadDevices() {
    ensureStyles();
    ensurePanel();

    const tbody = document.getElementById("rdTbody");
    if (tbody) tbody.innerHTML = '<tr><td colspan="10" class="muted small">Loading registered devices…</td></tr>';

    await loadCompanies();

    const status = state.filters.status || null;
    const companyId = state.filters.company_id || null;

    const { data, error } = await sb().rpc("csvb_admin_list_registered_devices", {
      p_status: status,
      p_company_id: companyId
    });

    if (error) throw error;
    state.devices = data || [];
    renderSummary();
    renderTable();
  }

  function parseDate(value) {
    if (!value) return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d;
  }

  function isWithinDays(value, days) {
    const d = parseDate(value);
    if (!d) return false;
    const ageMs = Date.now() - d.getTime();
    return ageMs >= 0 && ageMs <= days * 24 * 60 * 60 * 1000;
  }

  function deviceSearchText(d) {
    return [
      d.device_label,
      d.device_public_id,
      d.device_type,
      d.platform,
      companyLabel(d.company_id),
      d.vessel_id,
      d.requested_by_username,
      d.requested_by,
      d.approved_by_username,
      d.approved_by,
      d.last_user_username,
      d.last_user_id,
      d.user_agent_summary,
      Array.isArray(d.offline_allowed_modules) ? d.offline_allowed_modules.join(" ") : ""
    ].map((x) => String(x || "")).join(" ").toLowerCase();
  }

  function getFilteredDevices() {
    const offline = state.filters.offline || "";
    const deviceType = state.filters.device_type || "";
    const lastSeen = state.filters.last_seen || "";
    const q = String(state.filters.search || "").trim().toLowerCase();

    return (state.devices || []).filter((d) => {
      if (offline === "yes" && d.offline_allowed !== true) return false;
      if (offline === "no" && d.offline_allowed === true) return false;

      if (deviceType && String(d.device_type || "") !== deviceType) return false;

      if (lastSeen === "never" && d.last_seen_at) return false;
      if (lastSeen === "24h" && !isWithinDays(d.last_seen_at, 1)) return false;
      if (lastSeen === "7d" && !isWithinDays(d.last_seen_at, 7)) return false;
      if (lastSeen === "30d" && !isWithinDays(d.last_seen_at, 30)) return false;

      if (q && !deviceSearchText(d).includes(q)) return false;

      return true;
    });
  }

  function renderSummary() {
    const host = document.getElementById("rdSummary");
    if (!host) return;
    const visible = getFilteredDevices();
    const counts = { all: visible.length, pending: 0, approved: 0, blocked: 0, revoked: 0, offline: 0 };
    for (const d of visible) {
      if (counts[d.status] !== undefined) counts[d.status] += 1;
      if (d.offline_allowed) counts.offline += 1;
    }
    host.innerHTML = [
      ['Shown', counts.all],
      ['Pending', counts.pending],
      ['Approved', counts.approved],
      ['Blocked', counts.blocked],
      ['Revoked', counts.revoked],
      ['Offline allowed', counts.offline]
    ].map(([label, n]) => `<div class="csvb-dev-summary-box"><div class="n">${esc(n)}</div><div class="t">${esc(label)}</div></div>`).join("");
  }

  function renderTable() {
    const tbody = document.getElementById("rdTbody");
    if (!tbody) return;

    const visible = getFilteredDevices();

    if (!visible.length) {
      tbody.innerHTML = '<tr><td colspan="10" class="muted small">No devices found for the selected filters.</td></tr>';
      return;
    }

    tbody.innerHTML = visible.map((d) => {
      const offlineModules = Array.isArray(d.offline_allowed_modules) ? d.offline_allowed_modules.join(", ") : "";
      return `
        <tr data-device-id="${esc(d.device_id)}">
          <td><span class="csvb-dev-pill ${statusClass(d.status)}">${esc(d.status || "—")}</span></td>
          <td>
            <div><b>${esc(d.device_label || "—")}</b></div>
            <div class="csvb-dev-id" title="${esc(d.device_public_id || "")}">${esc(shortId(d.device_public_id))}</div>
          </td>
          <td>
            <div>${esc(d.device_type || "—")}</div>
            <div class="csvb-dev-small">${esc(d.platform || "—")}</div>
          </td>
          <td>
            <div>${esc(companyLabel(d.company_id))}</div>
            <div class="csvb-dev-small">Vessel: ${esc(d.vessel_id || "—")}</div>
          </td>
          <td>
            <div>${esc(d.requested_by_username || "—")}</div>
            <div class="csvb-dev-small">${esc(d.requested_by || "")}</div>
          </td>
          <td>
            <div>${esc(d.approved_by_username || "—")}</div>
            <div class="csvb-dev-small">${esc(d.approved_by || "")}</div>
          </td>
          <td>
            <div>${esc(d.last_user_username || "—")}</div>
            <div class="csvb-dev-small">${esc(d.last_user_id || "")}</div>
          </td>
          <td>
            <div>${d.offline_allowed ? "Yes" : "No"}</div>
            <div class="csvb-dev-small">${esc(offlineModules || "—")}</div>
          </td>
          <td>
            <div class="csvb-dev-small"><b>Requested:</b> ${esc(d.requested_at || "—")}</div>
            <div class="csvb-dev-small"><b>Approved:</b> ${esc(d.approved_at || "—")}</div>
            <div class="csvb-dev-small"><b>Last seen:</b> ${esc(d.last_seen_at || "—")}</div>
          </td>
          <td>
            <div class="csvb-dev-actions">
              <button class="btn2" type="button" data-rd-action="approve">Approve</button>
              <button class="btn2" type="button" data-rd-action="approve_offline">Approve + SIRE Offline</button>
              <button class="btn2" type="button" data-rd-action="block">Block</button>
              ${String(d.status || "") === "blocked" ? '<button class="btn2" type="button" data-rd-action="unblock">Unblock</button>' : ""}
              <button class="btnDanger" type="button" data-rd-action="revoke">Revoke</button>
            </div>
          </td>
        </tr>
      `;
    }).join("");

    tbody.querySelectorAll("button[data-rd-action]").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const tr = btn.closest("tr");
        const deviceId = tr?.dataset?.deviceId;
        const action = btn.dataset.rdAction;
        if (!deviceId || !action) return;
        await handleDeviceAction(deviceId, action);
      });
    });
  }

  async function handleDeviceAction(deviceId, action) {
    const d = state.devices.find((x) => String(x.device_id) === String(deviceId));
    const label = d?.device_label || shortId(d?.device_public_id) || deviceId;

    let rpc = "";
    let args = { p_device_id: deviceId };
    let confirmText = "";

    if (action === "approve") {
      rpc = "csvb_admin_approve_registered_device";
      args = { p_device_id: deviceId, p_offline_allowed: false, p_offline_allowed_modules: [], p_notes: "Approved for online access." };
      confirmText = `Approve device for online access only?\n\n${label}`;
    } else if (action === "approve_offline") {
      rpc = "csvb_admin_approve_registered_device";
      args = { p_device_id: deviceId, p_offline_allowed: true, p_offline_allowed_modules: ["SIRE_QUESTIONS_VIEWER"], p_notes: "Approved for online access and SIRE Questions Viewer offline package." };
      confirmText = `Approve device and allow SIRE Questions Viewer offline package?\n\n${label}`;
    } else if (action === "block") {
      rpc = "csvb_admin_block_registered_device";
      args = { p_device_id: deviceId, p_notes: "Blocked by administrator." };
      confirmText = `Block this device?\n\n${label}`;
    } else if (action === "unblock") {
        rpc = "csvb_admin_unblock_registered_device";
        args = {
          p_device_id: deviceId,
          p_notes: "Unblocked by administrator. Offline access remains disabled until explicitly approved again."
        };
        confirmText = "Unblock this device for online access only?\n\n" + label + "\n\nOffline access will remain disabled.";
    } else if (action === "revoke") {
      rpc = "csvb_admin_revoke_registered_device";
      args = { p_device_id: deviceId, p_notes: "Revoked by administrator." };
      confirmText = `Revoke this device?\n\n${label}`;
    }

    if (!rpc) return;
    if (!confirm(confirmText)) return;

    try {
      const { error } = await sb().rpc(rpc, args);
      if (error) throw error;
      showOkLocal("Device updated.");
      await loadDevices();
    } catch (e) {
      showWarnLocal("Device update failed:\n\n" + String(e?.message || e));
    }
  }

  function boot() {
    window.CSVB_REGISTERED_DEVICES_ADMIN = {
      BUILD,
      activateTab,
      loadDevices,
      getDevices: () => state.devices.slice()
    };

    ensureStyles();
    ensureTab();
    ensurePanel();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
